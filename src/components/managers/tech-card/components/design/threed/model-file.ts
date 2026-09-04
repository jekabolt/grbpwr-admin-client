import { formatBytes } from 'utils/pattern';

/**
 * ═══ ПРАВИЛА ФАЙЛА МОДЕЛИ — ОТДЕЛЬНО ОТ ОРГАНА, КОТОРЫЙ ИХ ПРИМЕНЯЕТ (E-13) ═══════════════════
 *
 * Владелец, дословно: «в 3D в 3D MODELS OF THIS CARD добавь возможность загрузить свою 3d модель».
 *
 * Здесь живут ТОЛЬКО правила, у которых нет ни разметки, ни сети: потолок, расширение и перевод
 * серверного отказа в слова. Вынесены из ячейки потому, что это единственная часть двери, которую
 * можно проверить, ничего не смонтировав, — и потому, что потолок обязан иметь ОДНО написание:
 * два числа для одного вопроса это то, из-за чего файл, принятый проверкой, отвергается
 * транспортом.
 */

/**
 * ═══ ПОТОЛОК — 50 MiB, И ЭТО ТРАНСПОРТ, А НЕ БАКЕТ ═══════════════════════════════════════════
 *
 * На пути .glb стоят ТРИ потолка, и бакетный — последний, то есть по REST недостижимый. Замерено
 * по задеплоенному бэкенду (`internal/api/http/http.go`, комментарий самого глагола
 * `UploadContentModel` в контракте), в порядке, в котором они срабатывают:
 *
 *   · raw ≲ 50 MiB — доезжает до хендлера, и отказы проверяющего читаемы;
 *   · ~50…54 MiB — `grpcMaxRecvMsgSize` (50 MiB) рубит петлевой gRPC-хоп: голый
 *     `ResourceExhausted`, ни одного слова, по которому человек может что-то сделать;
 *   · ≳ 54 MiB — `maxAdminJSONBodyBytes` (72 MiB) рубит base64-тело РАНЬШЕ, HTTP 400: base64
 *     раздувает на 4/3, то есть 72 MiB тела это 54 MiB модели;
 *   · 64 MiB (`bucket.maxModelPayloadBytes`) — СЮДА НЕ ДОЕЗЖАЕТ НИКОГДА. Он существует ради
 *     модели, которую наш же воркер уже оплатил и скачал в процессе, и тот путь этот шлюз не
 *     пересекает.
 *
 * Значит человек встречает 50 MiB, и назвать он должен именно их. Модель крупнее умирает НА
 * ТРАНСПОРТЕ отказом, который нечем показать: поэтому она отвергается ЗДЕСЬ, до отправки, — не
 * ради экономии круга, а потому что после отправки сказать уже нечего.
 *
 * ⚠ ЕДИНИЦА ПИШЕТСЯ «MB», И ЭТО НЕ НЕБРЕЖНОСТЬ. `formatBytes` (`utils/pattern.ts`) делит на 1024
 * и подписывает результат «MB»; тем же словом подписан потолок выкроек («40 MB — server hard
 * limit» при 40 × 1024 × 1024). Фраза отказа называет ОБА числа — вес файла и потолок, — и
 * назвать их разными единицами в одном предложении значило бы предложить человеку сравнивать
 * несравнимое. Число одно и то же; словарь — тот, на котором говорит остальная админка.
 */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

/** Что предлагает файловый диалог. Байты сервер нюхает сам — это только UX. */
export const MODEL_FILE_ACCEPT = '.glb,model/gltf-binary';

/**
 * Файл объявляет себя моделью.
 *
 * У .glb нет надёжного браузерного MIME (обычно пусто или `application/octet-stream`), поэтому
 * решает РАСШИРЕНИЕ — ровно тот же довод и та же форма, что у `isDxfFile`. Настоящую проверку
 * делает сервер: он читает 12 байт заголовка glTF-binary — магию, версию контейнера и объявленную
 * полную длину — и отвергает обрезанную закачку. Здесь же — предполётная вежливость.
 */
export function isGlbFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.glb') ||
    file.type.toLowerCase() === 'model/gltf-binary'
  );
}

/**
 * ПРЕДПОЛЁТНЫЙ ОТКАЗ — строка для человека, или `null`, когда файл можно отправлять.
 *
 * Три отказа, и каждый называет своё. Пустой файл отделён от не-той-формы намеренно: нулевой
 * `.glb` — это чаще всего сорванная выгрузка из редактора, и «это не glTF» отправило бы человека
 * искать не ту причину.
 */
export function modelFileError(file: File): string | null {
  if (!isGlbFile(file)) {
    return 'a .glb only — this door stores glTF binary and nothing else. Export the model as GLB and bring it again.';
  }
  if (file.size <= 0) {
    return 'that file is empty — the export produced no bytes.';
  }
  if (file.size > MAX_MODEL_BYTES) {
    return `that model is ${formatBytes(file.size)} and the ceiling is ${formatBytes(
      MAX_MODEL_BYTES,
    )} — a bigger one dies on the way up with an error nobody can read. Decimate the mesh or bake the textures smaller.`;
  }
  return null;
}

/**
 * ОТКАЗ СЕРВЕРА — В СЛОВАХ, ПО КОТОРЫМ МОЖНО ДЕЙСТВОВАТЬ.
 *
 * Читается ПО КОДУ, как и у соседних дверей: 400 несёт слова самого проверяющего контейнера («not
 * a glTF binary», «declares more bytes than arrived») и их надо показать как есть — это точный
 * диагноз, лучше которого у нас нет. Отсутствующий маршрут назван отдельно: grpc-gateway отвечает
 * на незарегистрированный путь 501, прокси перед ним может сделать из этого 404, и «модель не
 * загрузилась» на старом бинаре отправило бы человека чинить свой файл.
 */
export function modelUploadErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';
  if (status === 404 || status === 501)
    return 'this server has no model upload door yet — the route is not deployed. Nothing was sent; the file on your disk is untouched.';
  if (status === 400)
    return raw || 'the file was refused — it is not a glTF binary, or the container is cut short.';
  if (status && status >= 500) return 'upload error on the server — try again.';
  return raw || 'the model did not go up.';
}
