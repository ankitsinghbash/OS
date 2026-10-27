use windows::core::w;
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

pub struct DriveMetrics {
    pub letter: &'static str,
    pub total_gb: f64,
    pub free_gb: f64,
    pub used_gb: f64,
}

pub fn get_drive_metrics(drive_letter: &'static str) -> Option<DriveMetrics> {
    let path = match drive_letter {
        "C:" => w!("C:\\"),
        "D:" => w!("D:\\"),
        _ => return None,
    };

    let mut free_bytes_available: u64 = 0;
    let mut total_number_of_bytes: u64 = 0;
    let mut total_number_of_free_bytes: u64 = 0;

    let success = unsafe {
        GetDiskFreeSpaceExW(
            path,
            Some(&mut free_bytes_available),
            Some(&mut total_number_of_bytes),
            Some(&mut total_number_of_free_bytes),
        )
    };

    if success.is_ok() {
        let total_gb = total_number_of_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let free_gb = total_number_of_free_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let used_gb = total_gb - free_gb;

        Some(DriveMetrics {
            letter: drive_letter,
            total_gb: (total_gb * 10.0).round() / 10.0,
            free_gb: (free_gb * 10.0).round() / 10.0,
            used_gb: (used_gb * 10.0).round() / 10.0,
        })
    } else {
        None
    }
}
