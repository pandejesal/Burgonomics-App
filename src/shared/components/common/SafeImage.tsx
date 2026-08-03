import * as React from "react";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
}

/**
 * An image component that attempts to load a primary source (e.g. local assets / custom uploaded images)
 * and gracefully falls back to a high-quality curated Unsplash image if the primary fails to load.
 */
const DEFAULT_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23f97316' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z'/><path d='M3 13h18'/><path d='M4 17h16a2 2 0 0 1 2 2v1H2v-1a2 2 0 0 1 2-2z'/></svg>";

export function SafeImage({ src, fallbackSrc, alt = "", ...props }: SafeImageProps) {
  const [imgSrc, setImgSrc] = React.useState(src || fallbackSrc || DEFAULT_PLACEHOLDER);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setImgSrc(src || fallbackSrc || DEFAULT_PLACEHOLDER);
    setHasError(false);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      if (fallbackSrc && fallbackSrc !== imgSrc) {
        setImgSrc(fallbackSrc);
      } else {
        setImgSrc(DEFAULT_PLACEHOLDER);
      }
    }
  };

  return (
    <img src={imgSrc} alt={alt} onError={handleError} referrerPolicy="no-referrer" {...props} />
  );
}
