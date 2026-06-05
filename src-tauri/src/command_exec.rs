#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    ffi::OsStr,
    path::Path,
    process::Command,
    sync::Mutex,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn new_command(program: &str) -> Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

pub fn os_str_to_string(value: &OsStr) -> String {
    value
        .to_str()
        .map(String::from)
        .unwrap_or_else(|| value.to_string_lossy().into_owned())
}

pub fn decode_command_output(bytes: &[u8]) -> String {
    if let Ok(value) = String::from_utf8(bytes.to_vec()) {
        return value;
    }

    #[cfg(windows)]
    {
        if let Some(value) = decode_windows_ansi(bytes) {
            return value;
        }
    }

    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(windows)]
fn decode_windows_ansi(bytes: &[u8]) -> Option<String> {
    use windows_sys::Win32::Globalization::{GetACP, MultiByteToWideChar};

    if bytes.is_empty() {
        return Some(String::new());
    }

    unsafe {
        let code_page = GetACP();
        let required = MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if required <= 0 {
            return None;
        }

        let mut wide = vec![0u16; required as usize];
        let written = MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide.as_mut_ptr(),
            wide.len() as i32,
        );
        if written <= 0 {
            return None;
        }
        wide.truncate(written as usize);
        Some(String::from_utf16_lossy(&wide))
    }
}

#[cfg(windows)]
fn encode_windows_ansi(utf8_text: &str) -> Vec<u8> {
    use windows_sys::Win32::Globalization::{GetACP, WideCharToMultiByte};

    let wide: Vec<u16> = utf8_text.encode_utf16().collect();
    if wide.is_empty() {
        return Vec::new();
    }

    unsafe {
        let code_page = GetACP();
        let required = WideCharToMultiByte(
            code_page,
            0,
            wide.as_ptr(),
            wide.len() as i32,
            std::ptr::null_mut(),
            0,
            std::ptr::null(),
            std::ptr::null_mut(),
        );
        if required <= 0 {
            return utf8_text.as_bytes().to_vec(); // fallback
        }

        let mut bytes = vec![0u8; required as usize];
        let written = WideCharToMultiByte(
            code_page,
            0,
            wide.as_ptr(),
            wide.len() as i32,
            bytes.as_mut_ptr(),
            bytes.len() as i32,
            std::ptr::null(),
            std::ptr::null_mut(),
        );
        if written <= 0 {
            return utf8_text.as_bytes().to_vec(); // fallback
        }
        bytes.truncate(written as usize);
        bytes
    }
}

pub fn run_command<const N: usize>(parts: [&str; N]) -> Result<String, String> {
    let (program, args) = parts.split_first().ok_or_else(|| "命令为空".to_string())?;
    let resolved_program = resolve_program(program);
    let output = new_command(&resolved_program)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = decode_command_output(&output.stderr).trim().to_string();
        let stdout = decode_command_output(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() {
            if stdout.is_empty() {
                format!("命令执行失败：{resolved_program}")
            } else {
                stdout
            }
        } else {
            stderr
        });
    }

    Ok(decode_command_output(&output.stdout).trim_end().to_string())
}

pub fn run_command_args(program: &str, args: &[String]) -> Result<String, String> {
    let resolved_program = resolve_program(program);
    let output = new_command(&resolved_program)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = decode_command_output(&output.stderr).trim().to_string();
        let stdout = decode_command_output(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() {
            if stdout.is_empty() {
                format!("命令执行失败：{resolved_program}")
            } else {
                stdout
            }
        } else {
            stderr
        });
    }

    Ok(decode_command_output(&output.stdout).trim_end().to_string())
}

pub fn execute_script(shell: &str, script: &str) -> Result<(bool, String), String> {
    let extension = match shell {
        "powershell" => ".ps1",
        _ => ".bat",
    };

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("gvmt_hook_{}.{}", std::process::id(), extension));

    let file_bytes: Vec<u8> = if shell == "powershell" {
        // UTF-8 with BOM — PowerShell reads BOM-prefixed files correctly
        let mut bom = vec![0xEFu8, 0xBB, 0xBF];
        bom.extend_from_slice(script.as_bytes());
        bom
    } else {
        // CMD reads .bat in system code page; on zh-CN Windows that's GBK
        #[cfg(windows)]
        { encode_windows_ansi(script) }
        #[cfg(not(windows))]
        { script.as_bytes().to_vec() }
    };

    std::fs::write(&temp_file, &file_bytes).map_err(|error| format!("无法创建临时脚本文件: {error}"))?;

    let result = match shell {
        "powershell" => {
            new_command("powershell")
                .args(["-ExecutionPolicy", "Bypass", "-File"])
                .arg(&temp_file)
                .output()
        }
        _ => {
            new_command("cmd")
                .args(["/c"])
                .arg(&temp_file)
                .output()
        }
    };

    let _ = std::fs::remove_file(&temp_file);

    match result {
        Ok(output) => {
            let stdout = decode_command_output(&output.stdout);
            let stderr = decode_command_output(&output.stderr);
            let combined = crate::utils::combine_command_streams(&stdout, &stderr);
            Ok((output.status.success(), combined))
        }
        Err(error) => Err(format!("执行脚本失败: {error}")),
    }
}

pub fn resolve_program(program: &str) -> String {
    if !cfg!(windows) {
        return program.to_string();
    }

    match program {
        "npm" => "npm.cmd".to_string(),
        "svn" => svn_executable_candidates()
            .into_iter()
            .find(|candidate| Path::new(candidate).exists())
            .unwrap_or_else(|| program.to_string()),
        _ => program.to_string(),
    }
}

fn svn_executable_candidates() -> Vec<String> {
    let mut candidates = vec![
        "C:\\Program Files\\TortoiseSVN\\bin\\svn.exe",
        "C:\\Program Files (x86)\\TortoiseSVN\\bin\\svn.exe",
        "C:\\Program Files\\SlikSvn\\bin\\svn.exe",
        "C:\\Program Files (x86)\\SlikSvn\\bin\\svn.exe",
        "C:\\Program Files\\VisualSVN\\bin\\svn.exe",
    ]
    .into_iter()
    .map(ToOwned::to_owned)
    .collect::<Vec<_>>();

    candidates.extend(
        tortoise_svn_registry_directories()
            .into_iter()
            .map(|directory| {
                Path::new(&directory)
                    .join("bin")
                    .join("svn.exe")
                    .to_string_lossy()
                    .to_string()
            }),
    );

    candidates
}

fn tortoise_svn_registry_directories() -> Vec<String> {
    [
        "HKLM\\SOFTWARE\\TortoiseSVN",
        "HKLM\\SOFTWARE\\WOW6432Node\\TortoiseSVN",
    ]
    .into_iter()
    .filter_map(|key| registry_value(key, "Directory"))
    .collect()
}

fn registry_value(key: &str, value: &str) -> Option<String> {
    let output = new_command("reg")
        .args(["query", key, "/v", value])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = decode_command_output(&output.stdout);
    stdout.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with(value) {
            return None;
        }

        trimmed
            .split_once("REG_SZ")
            .map(|(_, path)| path.trim().to_string())
            .filter(|path| !path.is_empty())
    })
}

// ── Running PID tracking (for cancellation) ────────────────────────────────

static RUNNING_PID: Mutex<Option<u32>> = Mutex::new(None);

pub fn set_running_pid(pid: u32) {
    *RUNNING_PID.lock().unwrap() = Some(pid);
}

pub fn clear_running_pid() {
    *RUNNING_PID.lock().unwrap() = None;
}

pub fn kill_running_process() {
    if let Some(pid) = *RUNNING_PID.lock().unwrap() {
        #[cfg(windows)]
        {
            let _ = new_command("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
        #[cfg(not(windows))]
        {
            unsafe { libc::kill(pid as i32, libc::SIGKILL); }
        }
        *RUNNING_PID.lock().unwrap() = None;
    }
}