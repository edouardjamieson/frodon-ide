import type { AnimatedLogoProps } from './animated-logo.def';
import {
  EYE_CENTERS,
  PUPIL_RADIUS_X,
  PUPIL_RADIUS_Y,
  SOCKET_RADIUS,
} from './animated-logo.constant';
import { useEyesFollowCursor } from './animated-logo.hook';

export default function AnimatedLogo({ className }: AnimatedLogoProps) {
  const { svgRef, pupilRefs } = useEyesFollowCursor();

  return (
    <svg ref={svgRef} className={className} viewBox="0 0 237 208" fill="none">
      <path
        d="M0 13.4627C0 7.39338 6.49376 3.53458 11.8246 6.43617L114.675 62.4183C117.06 63.7162 119.94 63.7162 122.325 62.4183L225.175 6.43616C230.506 3.53457 237 7.39339 237 13.4627V200C237 204.418 233.418 208 229 208H8.00001C3.58173 208 0 204.418 0 200V13.4627Z"
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
