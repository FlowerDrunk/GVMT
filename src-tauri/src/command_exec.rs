#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    ffi::OsStr,
    path::Path,
    process::Command,
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

    Ok(decode_command_output(&output.stdout).trim().to_string())
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

    Ok(decode_command_output(&output.stdout).trim().to_string())
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