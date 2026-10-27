use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

pub struct MemoryMetrics {
    pub total_ram_mb: u64,
    pub free_ram_mb: u64,
    pub used_ram_mb: u64,
    pub memory_load_percent: u32,
    pub total_pagefile_mb: u64,
    pub free_pagefile_mb: u64,
}

pub fn get_memory_metrics() -> MemoryMetrics {
    let mut mem_status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };

    unsafe {
        let _ = GlobalMemoryStatusEx(&mut mem_status);
    }

    let total_mb = mem_status.ullTotalPhys / (1024 * 1024);
    let free_mb = mem_status.ullAvailPhys / (1024 * 1024);
    let used_mb = total_mb.saturating_sub(free_mb);

    MemoryMetrics {
        total_ram_mb: total_mb,
        free_ram_mb: free_mb,
        used_ram_mb: used_mb,
        memory_load_percent: mem_status.dwMemoryLoad,
        total_pagefile_mb: mem_status.ullTotalPageFile / (1024 * 1024),
        free_pagefile_mb: mem_status.ullAvailPageFile / (1024 * 1024),
    }
}
