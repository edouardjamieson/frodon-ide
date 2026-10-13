import type { AnimatedLogoProps } from './animated-logo.def';
import {
  EYE_CENTERS,
  PUPIL_RADIUS_X,
  PUPIL_RADIUS_Y,
  SOCKET_RADIUS,
} from './animated-logo.constant';
import { useEyesFollowCursor } from './animated-logo.hook';
import { useProject, useProjectColor } from '~/lib/project';

export default function AnimatedLogo({ className }: AnimatedLogoProps) {
  const { svgRef, pupilRefs } = useEyesFollowCursor();
  const projectColor = useProjectColor();
  const { isOpen } = useProject();

  return (
    <svg ref={svgRef} className={className} viewBox="0 0 277 246" fill="none">
      {/* The outline, drawn as a larger copy of the mark behind it. */}
      <path
        d="M0 24.0366C0 5.45198 20.2135 -6.08067 36.2122 3.37595L126.288 56.6184C133.821 61.0708 143.179 61.0708 150.712 56.6184L240.788 3.37594C256.787 -6.08069 277 5.45199 277 24.0366V221.971C277 235.226 266.255 245.971 253 245.971H24C10.7452 245.971 0 235.226 0 221.971V24.0366Z"
        fill={isOpen ? projectColor : 'white'}
        opacity={0.5}
      />
      <path
        d="M20 33.4334C20 27.3641 26.4938 23.5053 31.8246 26.4069L134.675 82.389C137.06 83.6869 139.94 83.6869 142.325 82.389L245.175 26.4069C250.506 23.5053 257 27.3641 257 33.4334V219.971C257 224.389 253.418 227.971 249 227.971H28C23.5817 227.971 20 224.389 20 219.971V33.4334Z"
        fill="black"
      />
      {EYE_CENTERS.map((eye, index) => (
        <g key={eye.x}>
          <circle cx={eye.x} cy={eye.y} r={SOCKET_RADIUS} fill="white" />
          {/*
            The hook writes a transform every frame; the transition turns that
            stream of exact positions into a gaze that glides after the cursor
            instead of snapping to it.
          */}
          <ellipse
            ref={pupilRefs[index]}
            className="transition-transform duration-150 ease-out"
            cx={eye.x}
            cy={eye.y}
            rx={PUPIL_RADIUS_X}
            ry={PUPIL_RADIUS_Y}
            fill="black"
          />
        </g>
      ))}
    </svg>
  );
}
