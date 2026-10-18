// ПРОПОРЦИИ КАДРА ПО ID КАРТИНКИ — чтобы правка вне поверхности (прикрепление картинки артворка в
// строке указания) могла считать в пикселях кадра, а не в долях. Доли кадра анизотропны: квадрат в
// долях на альбомном снимке — прямоугольник. Поверхность пишет сюда свой замер (`frameId`), строка
// читает. Нет замера — нет и подгонки: лучше не трогать зону, чем подогнать её не под тот кадр.

const aspects = new Map<number, number>();

export function setFrameAspect(mediaId: number, aspect: number) {
  if (mediaId > 0 && aspect > 0 && Number.isFinite(aspect)) aspects.set(mediaId, aspect);
}

export function frameAspectOf(mediaId: number | null | undefined): number | null {
  return (mediaId && aspects.get(mediaId)) || null;
}
