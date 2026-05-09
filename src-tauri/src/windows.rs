use crate::command_exec::{run_command, run_command_args};
use crate::models::WindowsContextMenuStatus;

/// Returns the current executable path as a string.
pub fn current_executable_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|path| crate::command_exec::os_str_to_string(path.as_os_str()))
        .map_err(|error| format!("无法读取当前程序路径：{error}"))
}

pub fn windows_context_menu_roots() -> [&'static str; 2] {
    [
        "HKCU\\Software\\Classes\\Directory\\shell\\GVMT",
        "HKCU\\Software\\Classes\\Directory\\Background\\shell\\GVMT",
    ]
}

pub fn windows_context_menu_installed() -> bool {
    windows_context_menu_roots()
        .into_iter()
        .all(|root| run_command(["reg", "query", root]).is_ok())
}

pub fn install_context_menu_root(
    root: &str,
    executable_path: &str,
    path_token: &str,
) -> Result<(), String> {
    set_registry_value(root, "MUIVerb", "GVMT")?;
    set_registry_value(root, "Icon", executable_path)?;
    set_registry_value(root, "SubCommands", "")?;

    for (key, label, action) in [
        ("open", "用 GVMT 打开", "--gvmt-open"),
        ("detect", "检测仓库", "--gvmt-detect"),
        ("update", "更新仓库", "--gvmt-update"),
        ("commit", "提交变更", "--gvmt-commit"),
    ] {
        let item_key = format!("{root}\\shell\\{key}");
        set_registry_default_value(&item_key, label)?;
        set_registry_value(&item_key, "Icon", executable_path)?;
        let command_key = format!("{item_key}\\command");
        set_registry_default_value(
            &command_key,
            &format!("\"{executable_path}\" {action} \"{path_token}\""),
        )?;
    }

    Ok(())
}

fn set_registry_default_value(key: &str, value: &str) -> Result<(), String> {
    run_command_args(
        "reg",
        &[
            "add".into(),
            key.into(),
            "/ve".into(),
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            value.into(),
            "/f".into(),
        ],
    )
    .map(|_| ())
}

fn set_registry_value(key: &str, name: &str, value: &str) -> Result<(), String> {
    run_command_args(
        "reg",
        &[
            "add".into(),
            key.into(),
            "/v".into(),
            name.into(),
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            value.into(),
            "/f".into(),
        ],
    )
    .map(|_| ())
}

pub fn get_windows_context_menu_status_impl() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Ok(WindowsContextMenuStatus {
            supported: false,
            installed: false,
            executable_path: None,
            warning: Some("当前平台不支持 Windows 右键菜单。".to_string()),
        });
    }

    let executable_path = current_executable_path()?;
    Ok(WindowsContextMenuStatus {
        supported: true,
        installed: windows_context_menu_installed(),
        executable_path: Some(executable_path),
        warning: None,
    })
}

pub fn install_windows_context_menu_impl() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Err("当前平台不支持 Windows 右键菜单。".to_string());
    }

    let executable_path = current_executable_path()?;
    install_context_menu_root(
        "HKCU\\Software\\Classes\\Directory\\shell\\GVMT",
        &executable_path,
        "%1",
    )?;
    install_context_menu_root(
        "HKCU\\Software\\Classes\\Directory\\Background\\shell\\GVMT",
        &executable_path,
        "%V",
    )?;

    Ok(WindowsContextMenuStatus {
        supported: true,
        installed: windows_context_menu_installed(),
        executable_path: Some(executable_path),
        warning: None,
    })
}

pub fn uninstall_windows_context_menu_impl() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Err("当前平台不支持 Windows 右键菜单。".to_string());
    }

    for root in windows_context_menu_roots() {
        let _ = run_command_args("reg", &["delete".into(), root.to_string(), "/f".into()]);
    }

    get_windows_context_menu_status_impl()
}

#[cfg(windows)]
pub fn show_message_box(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_ICONINFORMATION, MB_OK,
    };

    let title_wide: Vec<u16> = OsStr::new(title).encode_wide().chain(Some(0)).collect();
    let msg_wide: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let icon = if message.contains("失败") || message.contains("错误") {
        MB_ICONERROR
    } else {
        MB_ICONINFORMATION
    };
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            msg_wide.as_ptr(),
            title_wide.as_ptr(),
            MB_OK | icon,
        );
    }
}

#[cfg(not(windows))]
pub fn show_message_box(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}

#[cfg(windows)]
pub fn hide_console_window() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
    unsafe {
        let console = windows_sys::Win32::System::Console::GetConsoleWindow();
        if !console.is_null() {
            ShowWindow(console, SW_HIDE);
        }
    }
}

#[cfg(not(windows))]
pub fn hide_console_window() {}
/// Uses a Windows named mutex. Returns `true` if this is the first instance,
/// `false` if another instance is already running.
pub fn ensure_single_instance() -> bool {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Foundation::{CloseHandle, FALSE};
        use windows_sys::Win32::System::Threading::CreateMutexW;

        let mutex_name: Vec<u16> = OsStr::new("Local\\GVMT_SingleInstance")
            .encode_wide()
            .chain(Some(0))
            .collect();

        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), FALSE, mutex_name.as_ptr()) };
        if handle.is_null() {
            return true;
        }

        let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        if err == windows_sys::Win32::Foundation::ERROR_ALREADY_EXISTS as u32 {
            unsafe { CloseHandle(handle) };
            // Try to bring the existing window to foreground
            unsafe {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    SetForegroundWindow, ShowWindow, SW_RESTORE,
                };
                let hwnd = windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(
                    std::ptr::null(),
                    std::ptr::null(),
                );
                if !hwnd.is_null() {
                    ShowWindow(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd);
                }
            }
            return false;
        }

        // Keep the mutex handle open for the process lifetime.
        let _ = handle;
        true
    }

    #[cfg(not(windows))]
    {
        true
    }
}
