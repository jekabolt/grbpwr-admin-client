import { BlurhashImage } from './blurhash-image';

type ImageContainerProps = {
  aspectRatio?: string;
  children: React.ReactNode;
};

function ImageContainer({ aspectRatio, children }: ImageContainerProps) {
  if (aspectRatio === 'auto' || !aspectRatio) {
    return (
      <div className='relative w-full h-full overflow-hidden flex items-center justify-center'>
        {children}
      </div>
    );
  }

  return (
    <div className='relative w-full overflow-hidden' style={{ aspectRatio }}>
      {children}
    </div>
  );
}

type MediaProps = {
  alt: string;
  src: string;
  aspectRatio?: string;
  blurhash?: string;
  fit?: 'cover' | 'contain';
  type?: 'image' | 'video';
  load?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  [key: string]: unknown;
};

export default function MediaComponent({
  aspectRatio = '4/5',
  src,
  alt,
  blurhash,
  fit = 'cover',
  type = 'image',
  load = true,
  autoPlay = false,
  muted = true,
  loop = true,
  controls = false,
  ...props
}: MediaProps) {
  return (
    <ImageContainer aspectRatio={aspectRatio}>
      {type === 'image' ? (
        <BlurhashImage
          src={src}
          alt={alt}
          blurhash={blurhash}
          load={load}
          className={`absolute inset-0 block h-full w-full object-center ${
            fit === 'cover' ? 'object-cover' : 'object-contain'
          }`}
        />
      ) : (
        <video
          src={src}
          title={alt}
          className='w-full h-full'
          style={{
            objectFit: fit,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          controls={controls}
          playsInline
          {...props}
        />
      )}
    </ImageContainer>
  );
}
