use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, ChangeDisplaySettingsExW, DEVMODEW, ENUM_CURRENT_SETTINGS,
    ENUM_DISPLAY_SETTINGS_MODE, DEVMODE_FIELD_FLAGS, CDS_UPDATEREGISTRY, DISP_CHANGE_SUCCESSFUL,
};
use windows::core::PCWSTR;

pub struct DisplayInfo {
    pub width: u32,
    pub height: u32,
    pub current_hz: u32,
    pub available_hz: Vec<u32>,
}

pub fn get_display_info() -> DisplayInfo {
    let mut current_mode: DEVMODEW = unsafe { std::mem::zeroed() };
    current_mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;

    unsafe {
        EnumDisplaySettingsW(PCWSTR::null(), ENUM_CURRENT_SETTINGS, &mut current_mode);
    }

    let mut available_hz = Vec::new();
    let mut mode_idx = 0;
    let mut temp_mode: DEVMODEW = unsafe { std::mem::zeroed() };
    temp_mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;

    while unsafe { EnumDisplaySettingsW(PCWSTR::null(), ENUM_DISPLAY_SETTINGS_MODE(mode_idx), &mut temp_mode).as_bool() } {
        if temp_mode.dmPelsWidth == current_mode.dmPelsWidth && temp_mode.dmPelsHeight == current_mode.dmPelsHeight {
            if !available_hz.contains(&temp_mode.dmDisplayFrequency) {
                available_hz.push(temp_mode.dmDisplayFrequency);
            }
        }
        mode_idx += 1;
    }

    available_hz.sort_by(|a, b| b.cmp(a)); // Sort descending (e.g. 144, 120, 60)

    DisplayInfo {
        width: current_mode.dmPelsWidth,
        height: current_mode.dmPelsHeight,
        current_hz: current_mode.dmDisplayFrequency,
        available_hz,
    }
}

pub fn switch_to_max_hz() -> Result<u32, String> {
    let info = get_display_info();
    let max_hz = *info.available_hz.first().unwrap_or(&info.current_hz);

    if max_hz == info.current_hz {
        return Ok(max_hz);
    }

    let mut target_mode: DEVMODEW = unsafe { std::mem::zeroed() };
    target_mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
    let mut mode_idx = 0;
    let mut found = false;

    while unsafe { EnumDisplaySettingsW(PCWSTR::null(), ENUM_DISPLAY_SETTINGS_MODE(mode_idx), &mut target_mode).as_bool() } {
        if target_mode.dmPelsWidth == info.width &&
           target_mode.dmPelsHeight == info.height &&
           target_mode.dmDisplayFrequency == max_hz {
            found = true;
            break;
        }
        mode_idx += 1;
    }

    if !found {
        return Err(format!("Could not find {} Hz mode for resolution {}x{}", max_hz, info.width, info.height));
    }

    target_mode.dmFields = DEVMODE_FIELD_FLAGS(0x00040000 | 0x00080000 | 0x00100000 | 0x00400000); // PELSWIDTH | PELSHEIGHT | BITSPERPEL | DISPLAYFREQUENCY
    let result = unsafe {
        ChangeDisplaySettingsExW(
            PCWSTR::null(),
            Some(&target_mode),
            None,
            CDS_UPDATEREGISTRY,
            None,
        )
    };

    if result == DISP_CHANGE_SUCCESSFUL {
        Ok(max_hz)
    } else {
        Err(format!("ChangeDisplaySettingsEx returned code: {}", result.0))
    }
}
