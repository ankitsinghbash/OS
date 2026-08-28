use std::process::Command;

pub fn lock_cpu_100_percent() -> Result<(), String> {
    // Execute powercfg to lock 100% min and max frequency on Battery & AC
    let res1 = Command::new("powercfg")
        .args(["/setdcvalueindex", "scheme_current", "sub_processor", "PROCTHROTTLEMIN", "100"])
        .output();

    let res2 = Command::new("powercfg")
        .args(["/setdcvalueindex", "scheme_current", "sub_processor", "PROCTHROTTLEMAX", "100"])
        .output();

    let res3 = Command::new("powercfg")
        .args(["/setacvalueindex", "scheme_current", "sub_processor", "PROCTHROTTLEMIN", "100"])
        .output();

    let res4 = Command::new("powercfg")
        .args(["/setacvalueindex", "scheme_current", "sub_processor", "PROCTHROTTLEMAX", "100"])
        .output();

    let res5 = Command::new("powercfg")
        .args(["/setactive", "scheme_current"])
        .output();

    if res1.is_ok() && res2.is_ok() && res3.is_ok() && res4.is_ok() && res5.is_ok() {
        Ok(())
    } else {
        Err("Failed to execute powercfg commands".to_string())
    }
}
