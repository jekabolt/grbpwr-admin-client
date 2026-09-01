import { fetchMediaBlob } from 'lib/features/media-blob';
import { useEffect, useRef, type JSX } from 'react';

/**
 * ═══ СЦЕНА С МОДЕЛЬЮ: ЗАГРУЗИТЬ, РАЗОБРАТЬ, ПОСТАВИТЬ В КАДР, ДАТЬ ПОКРУТИТЬ ═══════════════════
 *
 * ПОЧЕМУ three, А НЕ `<model-viewer>`. `three` уже стоит в зависимостях этого репозитория
 * (`"three": "0.161.0"`, точный пин, плюс `@types/three`), и им уже смотрят DXF. Веб-компонент
 * привёз бы ВТОРУЮ копию three внутри себя, свой прогресс-бар, свою кнопку AR и свой набор
 * состояний — то есть второй диалект просмотрщика в приложении, где просмотрщик уже есть.
 *
 * ЗАГРУЗКА ИДЁТ ЧЕРЕЗ `fetchMediaBlob`, И ЭТО НЕ ПЕРЕСТРАХОВКА. Бакет отдаёт объекты БЕЗ
 * CORS-заголовков, и бэкенд говорит это дважды своими словами: «fetch подписанного URL из JS
 * упирается в CORS бакета — грабли, за которые фича выкроек уже заплатила»
 * (`internal/apisrv/admin/files_notes.go`, `internal/bucket/library_read.go` на origin/beta).
 * `fetchMediaBlob` — тот самый обход, которым грузится DXF: сначала прямо, а на стене CORS —
 * через `/media-proxy`, у которого обе половины (dev-middleware в `vite.config.ts` и
 * `api/media-proxy.js` на Vercel) уже согласованы. Своего третьего пути здесь нет.
 *
 * БАЙТЫ РАЗБИРАЮТСЯ `parse`, А НЕ `load` ПО blob-АДРЕСУ. `.glb` — самодостаточный контейнер, и
 * `parse` избавляет от единственной ловушки blob-адреса: у `.gltf` с внешними `.bin` и текстурами
 * загрузчик пошёл бы искать соседние файлы ОТНОСИТЕЛЬНО blob-адреса и не нашёл бы ничего.
 *
 * THREE ГРУЗИТСЯ ДИНАМИЧЕСКИ. Статический импорт положил бы всю библиотеку в главный кусок сборки
 * ради экрана, который открывают по кнопке. Так же поступает `dxf-quick-view-modal`.
 */

/** Что стало известно о модели ПОСЛЕ разбора — не обещание, а результат. */
export interface ModelFacts {
  /** Размер скачанного файла. Пока он неизвестен, человеку нечего сказать о весе. */
  bytes: number;
  meshes: number;
  triangles: number;
  /** Габариты в единицах файла, округлённые. */
  size: [number, number, number];
}

export function ModelViewer({
  url,
  onReady,
  onError,
}: {
  url: string;
  onReady: (facts: ModelFacts) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  // Обработчики держатся ссылкой: их пересоздание у вызывающего не обязано перезагружать модель.
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) return;

    let disposed = false;
    let teardown: (() => void) | null = null;

    (async () => {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }, blob] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/controls/OrbitControls.js'),
          fetchMediaBlob(url),
        ]);
        if (disposed) return;

        const buffer = await blob.arrayBuffer();
        if (disposed) return;

        /**
         * ⚠ КОНТЕЙНЕР ПРОВЕРЯЕТСЯ ДО РАЗБОРА, И ПРОВЕРЯЕТСЯ РАДИ СЛОВ, А НЕ РАДИ БЕЗОПАСНОСТИ.
         *
         * `GLTFLoader.parse`, не увидев магии `glTF`, принимает байты за ТЕКСТ `.gltf` и роняет
         * разбор JSON. Человек получает «Unexpected token <» — предложение, из которого нельзя
         * узнать ни что случилось, ни что делать. А случай при этом бытовой: прокси или CDN
         * отдали страницу ошибки с кодом 200, и в ответе лежит HTML вместо модели.
         *
         * Та же проверка стоит на другом конце (`checkGLB` в `internal/bucket/nonraster.go`), и
         * там сказано зачем: файл, который «открывается в ничём», хуже отказа, потому что выглядит
         * как удавшееся хранение.
         */
        const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        if (String.fromCharCode(...head) !== 'glTF') {
          throw new Error(
            'this file is not a glTF binary (.glb) — the download was truncated or something else came back in its place',
          );
        }

        const gltf = await new Promise<{ scene: import('three').Group }>((resolve, reject) => {
          new GLTFLoader().parse(buffer, '', resolve as never, reject);
        });
        if (disposed) return;

        const root = gltf.scene;

        /* СЧЁТ ВЕДЁТСЯ ПО РАЗОБРАННОМУ ДЕРЕВУ. Это и есть доказательство, что файл действительно
           стал геометрией: у неразобранного контейнера мешей нет вовсе. */
        let meshes = 0;
        let triangles = 0;
        root.traverse((node) => {
          const mesh = node as import('three').Mesh;
          if (!mesh.isMesh) return;
          meshes += 1;
          const geometry = mesh.geometry;
          const count = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0);
          triangles += Math.floor(count / 3);
        });

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scene = new THREE.Scene();
        /* Фон берётся ИЗ ТОКЕНА, а не задаётся числом: сцена стоит внутри модалки и обязана быть
           той же белой бумагой, что и всё вокруг. Так же читает свой фон DXF-просмотрщик. */
        const ground =
          getComputedStyle(document.documentElement).getPropertyValue('--color-bgColor').trim() || '#ffffff';
        scene.background = new THREE.Color(ground);
        scene.add(root);

        /* Свет ровный и бесцветный: это инструмент осмотра, а не витрина. Полусфера даёт объём
           теневой стороне, направленный — рёбра, слабый контровой — силуэт на светлом фоне. */
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.7);
        key.position.set(1, 1.6, 1.2);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.6);
        rim.position.set(-1.2, 0.4, -1);
        scene.add(rim);

        const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        // Иначе жест по модели на планшете прокручивает тело модалки вместо поворота камеры.
        renderer.domElement.style.touchAction = 'none';

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(center);
        // Инерция — ответ на жест, а не украшение; но человеку, попросившему меньше движения,
        // камера обязана вставать сразу.
        controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        controls.dampingFactor = 0.08;

        /* КАДРИРОВАНИЕ ПО ГАБАРИТАМ МОДЕЛИ, А НЕ ПО ЗАХАРДКОЖЕННОЙ ТОЧКЕ. Радиус описанной сферы,
           поделённый на синус половины угла обзора, — это расстояние, с которого модель ровно
           вписывается по вертикали. Узкое окно вписывает по ГОРИЗОНТАЛИ, поэтому берётся меньший
           из двух углов: иначе на портретной раскладке модель вылезала бы за края.

           ⚠ СФЕРА, А НЕ КОРОБКА, И ЭТО НЕ ЛЕНЬ. Описанная сфера НЕ ЗАВИСИТ ОТ ПОВОРОТА, поэтому
           расстояние, посчитанное по ней, годится для ЛЮБОГО угла орбиты. Вписать точно текущую
           проекцию коробки — значит поставить камеру так, что первый же поворот на 90° выведет
           длинную ось за край кадра. Плата за это — поля вокруг вытянутого предмета; 1.05 оставляет
           ровно тот запас, за которым уже начинается обрезка. */
        const radius = Math.max(size.length() * 0.5, 1e-4);
        const fit = () => {
          const w = host.clientWidth || 1;
          const h = host.clientHeight || 1;
          const aspect = w / h;
          camera.aspect = aspect;
          const vFov = (camera.fov * Math.PI) / 180;
          const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
          const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
          camera.near = Math.max(distance / 1000, 1e-4);
          camera.far = distance * 100;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
          return distance;
        };

        const distance = fit();
        // Три четверти сверху: единственный ракурс, на котором сразу видно, что предмет объёмный.
        camera.position.set(
          center.x + distance * 0.55,
          center.y + distance * 0.4,
          center.z + distance * 0.72,
        );
        controls.update();

        const observer = new ResizeObserver(() => {
          const d = fit();
          void d;
          controls.update();
        });
        observer.observe(host);

        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });

        onReadyRef.current({
          bytes: blob.size,
          meshes,
          triangles,
          size: [round3(size.x), round3(size.y), round3(size.z)],
        });

        teardown = () => {
          observer.disconnect();
          renderer.setAnimationLoop(null);
          controls.dispose();
          scene.traverse((node) => {
            const mesh = node as import('three').Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry?.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              if (!material) continue;
              for (const value of Object.values(material as unknown as Record<string, unknown>)) {
                (value as { isTexture?: boolean; dispose?: () => void })?.isTexture &&
                  (value as { dispose: () => void }).dispose();
              }
              material.dispose();
            }
          });
          /* ⚠ КОНТЕКСТ ОТПУСКАЕТСЯ ЯВНО. `dispose()` сам по себе его НЕ теряет — three держит его
             до сборки мусора, — а у браузера есть жёсткий потолок живых WebGL-контекстов. Модалку
             открывают и закрывают десятками раз за сессию, и без этой строки где-то на втором
             десятке сцена просто перестаёт рисоваться. Тот же урок записан в DXF-просмотрщике. */
          renderer.forceContextLoss();
          renderer.dispose();
          renderer.domElement.remove();
        };
        if (disposed) teardown();
      } catch (error) {
        if (disposed) return;
        onErrorRef.current(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [url]);

  return <div ref={hostRef} className='h-full w-full' />;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
