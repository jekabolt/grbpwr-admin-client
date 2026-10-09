// Общее для рисунков ленты (символы ухода, монограмма, своё лого составника): контур в единицах
// исходника и ошибка разбора с адресом. Отдельный файл — чтобы адаптер и разбор SVG лого не тянули
// за собой 40 файлов символов ухода из `artwork.ts`.
import type { PathCmd } from '../assembly-print/paper';

export type ArtPath = { d: PathCmd[]; fill: boolean; fillRule?: 'nonzero' | 'evenodd'; sw: number };
export type Art = { vx: number; vy: number; vw: number; vh: number; paths: ArtPath[] };

export class ArtworkError extends Error {
  constructor(
    readonly where: string,
    message: string,
  ) {
    super(`${where}: ${message}`);
    this.name = 'ArtworkError';
  }
}
