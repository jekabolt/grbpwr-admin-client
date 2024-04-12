import { adminService } from './admin';
import {
    UpdateSettingsRequest,
    UpdateSettingsResponse
} from './proto-http/admin';

export function updateSettings(
    request: UpdateSettingsRequest,
): Promise<UpdateSettingsResponse> {
    return adminService.UpdateSettings(request);
}
