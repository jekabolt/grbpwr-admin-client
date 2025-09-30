import { adminService, frontService } from './admin';
import { AddHeroRequest, AddHeroResponse } from './proto-http/admin';
import { GetHeroRequest, GetHeroResponse } from './proto-http/frontend';

export function addHero(request: AddHeroRequest): Promise<AddHeroResponse> {
  return adminService.AddHero(request);
}

export function getHero(request: GetHeroRequest): Promise<GetHeroResponse> {
  return frontService.GetHero(request);
}
