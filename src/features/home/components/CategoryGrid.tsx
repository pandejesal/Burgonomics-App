import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { MenuCategory } from "@/features/menu/services/menuService";
import { resolveHomeMenuShortcuts } from "@/features/home/utils/menuShortcuts";
import "./CategoryGrid.css";

interface Props {
  categories: MenuCategory[];
  className?: string;
}

/** A single, image-only flip per visit; no repeating animation or hidden timers. */
function usePhotoFlip(
  element: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  index: number,
) {
  const [flipped, setFlipped] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setFlipped(false);
      return;
    }
    if (typeof IntersectionObserver === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const node = element.current;
    if (!node) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    let played = false;

    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      if (played || !visible || motion.matches || document.visibilityState === "hidden") return;
      timer = setTimeout(
        () => {
          timer = undefined;
          if (!visible || motion.matches || document.visibilityState === "hidden") return;
          played = true;
          setFlipped(true);
        },
        800 + index * 150,
      );
    };
    const onMotionChange = () => {
      if (motion.matches) setFlipped(false);
      schedule();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((candidate) => candidate.target === node);
        if (!entry) return;
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        schedule();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", onMotionChange);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", onMotionChange);
    };
  }, [element, enabled, index]);

  return flipped;
}

function ShortcutPhoto({
  imageUrl,
  alternateImageUrl,
  index,
  expectPhoto,
}: {
  imageUrl: string | null;
  alternateImageUrl: string | null;
  index: number;
  expectPhoto: boolean;
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState<string[]>([]);
  const images = [imageUrl, alternateImageUrl].filter(
    (url, position, all): url is string =>
      !!url && all.indexOf(url) === position && !failed.includes(url),
  );
  const canFlip = images.length === 2 && images.every((url) => loaded.includes(url));
  const flipped = usePhotoFlip(frame, canFlip, index);

  const photo = (url: string, back = false) => (
    <img
      key={url}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded((current) => (current.includes(url) ? current : [...current, url]))}
      onError={() => setFailed((current) => (current.includes(url) ? current : [...current, url]))}
      className={cn("home-shortcut-photo__face", back && "home-shortcut-photo__face--back")}
    />
  );

  return (
    <div
      ref={frame}
      aria-hidden="true"
      data-flipped={canFlip && flipped}
      className="home-shortcut-photo absolute inset-0 overflow-hidden bg-bg-secondary"
    >
      {images.length > 0 ? (
        <div
          className={cn(
            "home-shortcut-photo__faces",
            canFlip && flipped && "home-shortcut-photo__faces--flipped",
          )}
        >
          {photo(images[0])}
          {images[1] && photo(images[1], true)}
        </div>
      ) : expectPhoto ? (
        // A photo was expected but failed to load: say so.
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center px-3 text-center text-sm text-text-secondary"
        >
          Photo unavailable
        </span>
      ) : null}
    </div>
  );
}

export function CategoryGrid({ categories, className }: Props) {
  const navigate = useNavigate();
  const shortcuts = resolveHomeMenuShortcuts(categories).filter(
    (shortcut) => shortcut.members.length > 0 && shortcut.imageUrl,
  );

  if (shortcuts.length === 0) return null;

  return (
    <div className={cn("px-4", className)}>
      <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-3">
        {shortcuts.map((shortcut, index) => {
          const target = shortcut.members[0];
          return (
            <button
              key={shortcut.key}
              type="button"
              disabled={!target}
              aria-label={shortcut.label}
              onClick={() => {
                if (!target) return;
                void HapticService.selection();
                void navigate({
                  to: "/menu",
                  search: { category: target.id },
                });
              }}
              className={cn(
                "relative grid min-h-11 min-w-0 grid-cols-1 overflow-hidden rounded-xl bg-bg-secondary text-left",
                "before:pointer-events-none before:col-start-1 before:row-start-1 before:aspect-square before:w-full before:content-['']",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                "enabled:hover:opacity-95 disabled:cursor-default",
              )}
            >
              <ShortcutPhoto
                imageUrl={shortcut.imageUrl}
                alternateImageUrl={shortcut.alternateImageUrl}
                index={index}
                expectPhoto={Boolean(shortcut.imageUrl)}
              />

              {/* The square sizing cell and label share a grid row. The label
                  can grow that row at 200% text without moving with the photo.
                  The scrim only exists where white text sits on photography. */}
              <div
                className={cn(
                  "pointer-events-none relative z-10 col-start-1 row-start-1 w-full min-w-0 self-end px-3 pb-3 pt-4",
                  shortcut.imageUrl && "bg-gradient-to-t from-black/80 via-black/50 to-transparent",
                )}
              >
                <h4
                  className={cn(
                    "type-subheading break-words text-base leading-snug",
                    shortcut.imageUrl ? "text-white" : "text-text-primary",
                  )}
                >
                  {shortcut.label}
                </h4>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
