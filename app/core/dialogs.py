"""原生文件/文件夹选择对话框（Win32 IFileDialog COM，无第三方依赖）。

HTTP 处理线程里直接调用：每次调用自行 CoInitializeEx(STA)。
"""
from __future__ import annotations

import ctypes
import os
import uuid
from ctypes import POINTER, byref, c_uint, c_ulong, c_void_p, c_wchar_p, wintypes

_ole32 = ctypes.WinDLL("ole32")
_shell32 = ctypes.WinDLL("shell32")
_user32 = ctypes.WinDLL("user32")

HRESULT = ctypes.c_long
S_OK = 0
ERROR_CANCELLED = -2147023673  # 0x800704C7
RPC_E_CHANGED_MODE = 0x80010106

FOS_OVERWRITEPROMPT = 0x00000002
FOS_NOCHANGEDIR = 0x00000008
FOS_PICKFOLDERS = 0x00000020
FOS_FORCEFILESYSTEM = 0x00000040
FOS_ALLOWMULTISELECT = 0x00000200
FOS_PATHMUSTEXIST = 0x00000800
FOS_FILEMUSTEXIST = 0x00001000

SIGDN_FILESYSPATH = 0x80058000


class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]

    def __init__(self, text: str = "") -> None:
        if text:
            raw = uuid.UUID(text).bytes_le
            ctypes.memmove(ctypes.byref(self), raw, len(raw))


class FilterSpec(ctypes.Structure):
    _fields_ = [("pszName", ctypes.c_wchar_p), ("pszSpec", ctypes.c_wchar_p)]


CLSID_FileOpenDialog = GUID("{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}")
CLSID_FileSaveDialog = GUID("{C0B4E2F3-BA21-4773-8DBA-335EC946EB8B}")
IID_IFileOpenDialog = GUID("{d57c7288-d4ad-4768-be02-9d969532d960}")
IID_IFileSaveDialog = GUID("{84bccd23-5fde-4cdb-aea4-af64b83d78ab}")
IID_IShellItem = GUID("{43826d1e-e718-42ee-bc55-a1e261c37bfe}")


def _vfn(ptr: c_void_p, index: int, restype, *argtypes):
    """取 COM 对象 vtable 第 index 个方法。"""
    vtable = ctypes.cast(ptr, POINTER(POINTER(c_void_p))).contents
    prototype = ctypes.WINFUNCTYPE(restype, c_void_p, *argtypes)
    return prototype(vtable[index])


def _release(ptr) -> None:
    if ptr:
        try:
            _vfn(ptr, 2, c_ulong)(ptr)
        except Exception:
            pass


def _check(hr: int, what: str) -> None:
    if hr != S_OK:
        raise OSError(f"{what} 失败（HRESULT 0x{hr & 0xFFFFFFFF:08X}）")


def _shell_item_from_path(path: str) -> c_void_p:
    item = c_void_p()
    fn = _shell32.SHCreateItemFromParsingName
    fn.argtypes = [c_wchar_p, c_void_p, POINTER(GUID), POINTER(c_void_p)]
    fn.restype = HRESULT
    hr = fn(str(path), None, byref(IID_IShellItem), byref(item))
    _check(hr, "解析初始路径")
    return item


def _display_name(item: c_void_p) -> str | None:
    name = c_wchar_p()
    hr = _vfn(item, 5, HRESULT, c_uint, POINTER(c_wchar_p))(item, SIGDN_FILESYSPATH, byref(name))
    if hr != S_OK:
        return None
    value = name.value
    raw = ctypes.cast(name, c_void_p).value
    if raw:
        _ole32.CoTaskMemFree(c_void_p(raw))
    return value


def _owner_hwnd() -> int:
    """优先用 pywebview 主窗口，其次前台窗口。"""
    try:
        from webview.platforms.winforms import BrowserView  # type: ignore

        for form in list(BrowserView.instances.values()):
            handle = getattr(form, "Handle", None)
            if handle:
                return int(handle)
    except Exception:
        pass
    try:
        return int(_user32.GetForegroundWindow())
    except Exception:
        return 0


def _co_init() -> bool:
    hr = _ole32.CoInitializeEx(None, 2)  # COINIT_APARTMENTTHREADED
    return hr != RPC_E_CHANGED_MODE


def _co_uninit(initialized: bool) -> None:
    if initialized:
        try:
            _ole32.CoUninitialize()
        except Exception:
            pass


def _make_dialog(save: bool) -> c_void_p:
    clsid = CLSID_FileSaveDialog if save else CLSID_FileOpenDialog
    iid = IID_IFileSaveDialog if save else IID_IFileOpenDialog
    ptr = c_void_p()
    _ole32.CoCreateInstance.argtypes = [POINTER(GUID), c_void_p, c_ulong, POINTER(GUID), POINTER(c_void_p)]
    _ole32.CoCreateInstance.restype = HRESULT
    hr = _ole32.CoCreateInstance(byref(clsid), None, 1, byref(iid), byref(ptr))  # CLSCTX_INPROC_SERVER
    if (hr & 0xFFFFFFFF) == 0x800401F0:  # CO_E_NOTINITIALIZED：兜底初始化
        _co_init()
        hr = _ole32.CoCreateInstance(byref(clsid), None, 1, byref(iid), byref(ptr))
    _check(hr, "创建文件对话框")
    return ptr


def _set_options(ptr: c_void_p, options: int) -> None:
    current = c_ulong()
    if _vfn(ptr, 10, HRESULT, POINTER(c_ulong))(ptr, byref(current)) != S_OK:
        current = c_ulong(0)
    _vfn(ptr, 9, HRESULT, c_ulong)(ptr, c_ulong(current.value | options))


def _set_title(ptr: c_void_p, title: str) -> None:
    if title:
        _vfn(ptr, 17, HRESULT, c_wchar_p)(ptr, title)


def _set_folder(ptr: c_void_p, folder: str) -> None:
    if folder and os.path.isdir(folder):
        try:
            item = _shell_item_from_path(folder)
        except OSError:
            return
        try:
            _vfn(ptr, 11, HRESULT, c_void_p)(ptr, item)  # SetDefaultFolder
            _vfn(ptr, 12, HRESULT, c_void_p)(ptr, item)  # SetFolder
        finally:
            _release(item)


def _set_filters(ptr: c_void_p, filters: list[tuple[str, str]] | None) -> None:
    if not filters:
        return
    specs = (FilterSpec * len(filters))()
    for i, (label, pattern) in enumerate(filters):
        specs[i].pszName = label
        specs[i].pszSpec = pattern
    _vfn(ptr, 4, HRESULT, c_uint, POINTER(FilterSpec))(ptr, c_uint(len(filters)), specs)


def _collect_results(ptr: c_void_p) -> list[str]:
    paths: list[str] = []
    array = c_void_p()
    hr = _vfn(ptr, 27, HRESULT, POINTER(c_void_p))(ptr, byref(array))  # IFileOpenDialog::GetResults
    if hr != S_OK or not array:
        return paths
    try:
        count = c_ulong()
        _check(_vfn(array, 7, HRESULT, POINTER(c_ulong))(array, byref(count)), "读取选择结果")
        for index in range(count.value):
            item = c_void_p()
            if _vfn(array, 8, HRESULT, c_ulong, POINTER(c_void_p))(array, c_ulong(index), byref(item)) == S_OK and item:
                try:
                    value = _display_name(item)
                    if value:
                        paths.append(value)
                finally:
                    _release(item)
    finally:
        _release(array)
    return paths


def pick_files(initial_dir: str = "", title: str = "选择文件",
               filters: list[tuple[str, str]] | None = None,
               multi: bool = True) -> list[str] | None:
    """返回选中的文件列表；用户取消返回 None。"""
    initialized = _co_init()
    try:
        ptr = _make_dialog(save=False)
        try:
            options = FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR
            if multi:
                options |= FOS_ALLOWMULTISELECT
            _set_options(ptr, options)
            _set_title(ptr, title)
            _set_folder(ptr, initial_dir)
            _set_filters(ptr, filters)
            hr = _vfn(ptr, 3, HRESULT, c_void_p)(ptr, c_void_p(_owner_hwnd()))  # Show
            if hr == ERROR_CANCELLED:
                return None
            _check(hr, "显示文件对话框")
            paths = _collect_results(ptr)
            if not paths:
                result = c_void_p()
                if _vfn(ptr, 20, HRESULT, POINTER(c_void_p))(ptr, byref(result)) == S_OK and result:
                    try:
                        value = _display_name(result)
                        if value:
                            paths = [value]
                    finally:
                        _release(result)
            return paths or None
        finally:
            _release(ptr)
    finally:
        _co_uninit(initialized)


def pick_folder(initial_dir: str = "", title: str = "选择文件夹") -> str | None:
    initialized = _co_init()
    try:
        ptr = _make_dialog(save=False)
        try:
            _set_options(ptr, FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR)
            _set_title(ptr, title)
            _set_folder(ptr, initial_dir)
            hr = _vfn(ptr, 3, HRESULT, c_void_p)(ptr, c_void_p(_owner_hwnd()))
            if hr == ERROR_CANCELLED:
                return None
            _check(hr, "显示文件夹对话框")
            result = c_void_p()
            if _vfn(ptr, 20, HRESULT, POINTER(c_void_p))(ptr, byref(result)) == S_OK and result:
                try:
                    return _display_name(result)
                finally:
                    _release(result)
            return None
        finally:
            _release(ptr)
    finally:
        _co_uninit(initialized)


def pick_save(initial_dir: str = "", title: str = "保存文件", default_name: str = "",
              filters: list[tuple[str, str]] | None = None,
              default_ext: str = "") -> str | None:
    initialized = _co_init()
    try:
        ptr = _make_dialog(save=True)
        try:
            _set_options(ptr, FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR | FOS_OVERWRITEPROMPT)
            _set_title(ptr, title)
            _set_folder(ptr, initial_dir)
            _set_filters(ptr, filters)
            if default_name:
                _vfn(ptr, 15, HRESULT, c_wchar_p)(ptr, default_name)  # SetFileName
            if default_ext:
                _vfn(ptr, 22, HRESULT, c_wchar_p)(ptr, default_ext)  # SetDefaultExtension
            hr = _vfn(ptr, 3, HRESULT, c_void_p)(ptr, c_void_p(_owner_hwnd()))
            if hr == ERROR_CANCELLED:
                return None
            _check(hr, "显示保存对话框")
            result = c_void_p()
            if _vfn(ptr, 20, HRESULT, POINTER(c_void_p))(ptr, byref(result)) == S_OK and result:
                try:
                    return _display_name(result)
                finally:
                    _release(result)
            return None
        finally:
            _release(ptr)
    finally:
        _co_uninit(initialized)
