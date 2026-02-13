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
  fit?: 'cover' | 'contain';
  type?: 'image' | 'video';
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  [key: string]: any;
};

export default function MediaComponent({
  aspectRatio = '4/5',
  src,
  alt,
  fit = 'cover',
  type = 'image',
  autoPlay = false,
  muted = true,
  loop = true,
  controls = false,
  ...props
}: MediaProps) {
  return (
    <ImageContainer aspectRatio={aspectRatio}>
      {type === 'image' ? (
        <img
          src={src}
          alt={alt}
          className='h-full w-full'
          style={{
            objectFit: fit,
          }}
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
