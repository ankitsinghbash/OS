use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

pub struct ProcessSummary {
    pub total_processes: usize,
    pub top_processes: Vec<(String, u32, u32)>, // (Name, PID, ThreadCount)
}

pub fn get_process_summary() -> ProcessSummary {
    let mut processes = Vec::new();

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap_or_default();
        if !snapshot.is_invalid() {
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let name_len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
                    processes.push((name, entry.th32ProcessID, entry.cntThreads));

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }

    processes.sort_by(|a, b| b.2.cmp(&a.2)); // Sort by thread count descending

    let total = processes.len();
    let top = processes.into_iter().take(5).collect();

    ProcessSummary {
        total_processes: total,
        top_processes: top,
    }
}
