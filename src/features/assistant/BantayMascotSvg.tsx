import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

export type BantayExpression = 'idle' | 'thinking' | 'celebration';
export type BantayVariant = 'bust' | 'full';

/** Full-variant only: lets a scene swap Bantay's resting paws/tail for its own pose, drawn in the same 120×120 space. */
export type BantayPoseOverride = {
  hideFrontPaws?: boolean;
  hideTail?: boolean;
  layer?: React.ReactNode;
};

export interface BantayMascotSvgProps {
  expression?: BantayExpression;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: BantayVariant;
  pose?: BantayPoseOverride;
}

/**
 * Bantay 2.0 - Philippine Aspin (Asong Pinoy) Healthcare Caregiver Mascot
 *
 * Vector SVG authored illustration with:
 * - Bespoke Philippine Aspin anatomy: golden caramel coat (#D9944D), warm muzzle (#FDF5EB),
 *   folded triangular ears with peach interior (#F5B8A7), and expressive espresso eyes (#2D1C10).
 * - Caregiver attire: Alaga Deep Forest Evergreen (#1B4D3E) & Emerald (#2D6A4F) scrubs,
 *   crisp caregiver cap (#FFFFFF) with medical cross, and stethoscope detail.
 * - Procedural expressions: 'idle' (gentle gaze & smile), 'thinking' (perked ear & quizzical look),
 *   'celebration' (joyful crescent eyes, open smile & tongue, rosy blush).
 * - Variants: 'bust' (header & banner portrait) and 'full' (complete character).
 * - Zero drop shadows: pure structural linework and color layering.
 */
export function BantayMascotSvg({
  expression = 'idle',
  size = 64,
  style,
  testID = 'bantay-mascot-svg',
  variant = 'bust',
  pose,
}: BantayMascotSvgProps) {
  if (variant === 'bust') {
    return (
      <View
        accessibilityRole="image"
        style={[{ height: size, width: size }, style]}
        testID={testID}
      >
        <Svg height={size} viewBox="0 0 100 100" width={size}>
          <Defs>
            {/* Coat Gradients */}
            <LinearGradient id="coatGradBust" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor="#E5A866" />
              <Stop offset="100%" stopColor="#C77C36" />
            </LinearGradient>
            <LinearGradient id="scrubGradBust" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor="#2D6A4F" />
              <Stop offset="100%" stopColor="#1B4D3E" />
            </LinearGradient>
            <LinearGradient id="earInnerGrad" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor="#FAD2C8" />
              <Stop offset="100%" stopColor="#F5B8A7" />
            </LinearGradient>
          </Defs>

          {/* 1. Caregiver Scrub Shoulders & Collar (Bust Base) */}
          <Path
            d="M 16 94 Q 18 78 30 74 L 50 82 L 70 74 Q 82 78 84 94 Z"
            fill="url(#scrubGradBust)"
          />
          {/* Scrub V-Neck Inset */}
          <Path
            d="M 40 76 L 50 90 L 60 76 Z"
            fill="#143A2F"
          />
          <Path
            d="M 44 76 L 50 85 L 56 76 Z"
            fill="#FDF5EB"
          />

          {/* Stethoscope Tubing across shoulders */}
          <Path
            d="M 28 80 Q 50 98 72 80"
            fill="none"
            stroke="#52B788"
            strokeLinecap="round"
            strokeWidth="3"
          />
          {/* Stethoscope Bell Chestpiece */}
          <Circle cx="50" cy="95" fill="#E2ECE5" r="4.5" stroke="#1B4D3E" strokeWidth="1.2" />
          <Circle cx="50" cy="95" fill="#52B788" r="2" />

          {/* 2. Neck */}
          <Rect fill="#D9944D" height="14" rx="4" width="22" x="39" y="66" />

          {/* 3. Ears (Aspin triangular floppy ears) */}
          {expression === 'thinking' ? (
            /* Left ear perked higher in thought, right ear resting */
            <>
              <G transform="rotate(-14 26 40)">
                <Path
                  d="M 24 44 Q 10 32 18 18 Q 30 20 32 36 Z"
                  fill="url(#coatGradBust)"
                />
                <Path
                  d="M 22 40 Q 15 30 20 22 Q 28 24 28 35 Z"
                  fill="url(#earInnerGrad)"
                />
              </G>
              <G transform="rotate(6 74 44)">
                <Path
                  d="M 76 44 Q 90 34 82 22 Q 70 22 68 38 Z"
                  fill="url(#coatGradBust)"
                />
                <Path
                  d="M 78 40 Q 85 32 80 25 Q 72 26 72 36 Z"
                  fill="url(#earInnerGrad)"
                />
              </G>
            </>
          ) : expression === 'celebration' ? (
            /* Both ears perked alert & joyful */
            <>
              <G transform="rotate(-8 26 36)">
                <Path
                  d="M 26 42 Q 10 26 22 14 Q 34 18 34 34 Z"
                  fill="url(#coatGradBust)"
                />
                <Path
                  d="M 24 38 Q 14 26 22 18 Q 30 21 30 32 Z"
                  fill="url(#earInnerGrad)"
                />
              </G>
              <G transform="rotate(8 74 36)">
                <Path
                  d="M 74 42 Q 90 26 78 14 Q 66 18 66 34 Z"
                  fill="url(#coatGradBust)"
                />
                <Path
                  d="M 76 38 Q 86 26 78 18 Q 70 21 70 32 Z"
                  fill="url(#earInnerGrad)"
                />
              </G>
            </>
          ) : (
            /* Idle: Natural gentle Aspin fold */
            <>
              <Path
                d="M 28 42 Q 12 34 20 22 Q 32 24 34 38 Z"
                fill="url(#coatGradBust)"
              />
              <Path
                d="M 26 40 Q 16 33 21 25 Q 29 27 30 36 Z"
                fill="url(#earInnerGrad)"
              />
              <Path
                d="M 72 42 Q 88 34 80 22 Q 68 24 66 38 Z"
                fill="url(#coatGradBust)"
              />
              <Path
                d="M 74 40 Q 84 33 79 25 Q 71 27 70 36 Z"
                fill="url(#earInnerGrad)"
              />
            </>
          )}

          {/* 4. Head Base Shape (Soft warm golden puppy contour) */}
          <Ellipse cx="50" cy="50" fill="url(#coatGradBust)" rx="27" ry="24" />

          {/* Forehead Highlights & Tuft */}
          <Path
            d="M 44 28 Q 50 24 56 28 Q 50 32 44 28 Z"
            fill="#F3C79A"
            opacity="0.8"
          />

          {/* 5. Caregiver Medical Cap */}
          <G>
            {/* Cap Brim & Dome */}
            <Path
              d="M 34 29 Q 50 23 66 29 L 63 19 Q 50 16 37 19 Z"
              fill="#FFFFFF"
              stroke="#D6E2DA"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            {/* Medical Cross on Cap */}
            <Rect fill="#2D6A4F" height="7" rx="0.8" width="2.4" x="48.8" y="19" />
            <Rect fill="#2D6A4F" height="2.4" rx="0.8" width="7" x="46.5" y="21.3" />
          </G>

          {/* 6. Cheeks & Muzzle */}
          {/* Muzzle (Warm Cream #FDF5EB) */}
          <Ellipse cx="50" cy="58" fill="#FDF5EB" rx="15" ry="11" />

          {/* Subtle Rosy Cheeks */}
          <Ellipse
            cx="32"
            cy="56"
            fill="#F8A599"
            opacity={expression === 'celebration' ? '0.75' : '0.4'}
            rx={expression === 'celebration' ? '5.5' : '4.5'}
            ry="3.2"
          />
          <Ellipse
            cx="68"
            cy="56"
            fill="#F8A599"
            opacity={expression === 'celebration' ? '0.75' : '0.4'}
            rx={expression === 'celebration' ? '5.5' : '4.5'}
            ry="3.2"
          />

          {/* 7. Eyes & Eyebrows (Procedural by expression) */}
          {expression === 'celebration' ? (
            /* Joyful squint happy eye arcs (^ ^) */
            <>
              {/* Left Happy Arc */}
              <Path
                d="M 33 46 Q 39 40 45 46"
                fill="none"
                stroke="#2D1C10"
                strokeLinecap="round"
                strokeWidth="2.8"
              />
              {/* Right Happy Arc */}
              <Path
                d="M 55 46 Q 61 40 67 46"
                fill="none"
                stroke="#2D1C10"
                strokeLinecap="round"
                strokeWidth="2.8"
              />
              {/* Raised high eyebrows */}
              <Path
                d="M 34 38 Q 39 34 44 37"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <Path
                d="M 56 37 Q 61 34 66 38"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </>
          ) : expression === 'thinking' ? (
            /* Inquisitive glance looking up & tilted */
            <>
              {/* Left Eye */}
              <Ellipse cx="39" cy="46" fill="#2D1C10" rx="4.5" ry="5.2" />
              <Circle cx="40.5" cy="44" fill="#FFFFFF" r="1.8" />
              <Circle cx="37.8" cy="48" fill="#FFFFFF" r="0.9" />

              {/* Right Eye (Glancing upwards) */}
              <Ellipse cx="61" cy="45" fill="#2D1C10" rx="4.5" ry="5.2" />
              <Circle cx="62.5" cy="43" fill="#FFFFFF" r="1.8" />
              <Circle cx="59.8" cy="47" fill="#FFFFFF" r="0.9" />

              {/* Quizzical Asymmetric Eyebrows */}
              <Path
                d="M 34 37 Q 39 39 44 38"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <Path
                d="M 56 35 Q 62 31 67 36"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
            </>
          ) : (
            /* Idle: Warm, bright open eyes with dual highlights */
            <>
              {/* Left Eye */}
              <Ellipse cx="39" cy="46" fill="#2D1C10" rx="4.6" ry="5.4" />
              <Circle cx="37.5" cy="44.2" fill="#FFFFFF" r="1.9" />
              <Circle cx="41" cy="48" fill="#FFFFFF" r="0.9" />

              {/* Right Eye */}
              <Ellipse cx="61" cy="46" fill="#2D1C10" rx="4.6" ry="5.4" />
              <Circle cx="59.5" cy="44.2" fill="#FFFFFF" r="1.9" />
              <Circle cx="63" cy="48" fill="#FFFFFF" r="0.9" />

              {/* Soft friendly eyebrows */}
              <Path
                d="M 35 38 Q 39 35 43 38"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <Path
                d="M 57 38 Q 61 35 65 38"
                fill="none"
                stroke="#9A531A"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </>
          )}

          {/* 8. Nose (Cute dark button nose with soft highlight) */}
          <Path
            d="M 46 52 Q 50 50 54 52 Q 55 56 50 58 Q 45 56 46 52 Z"
            fill="#2C1E14"
          />
          <Circle cx="48.5" cy="52.5" fill="#FFFFFF" opacity="0.6" r="1.1" />

          {/* 9. Mouth (Procedural) */}
          {expression === 'celebration' ? (
            /* Open beaming smile with cute pink tongue */
            <G>
              <Path
                d="M 44 58 Q 50 68 56 58 Z"
                fill="#8C1C13"
              />
              {/* Little pink tongue */}
              <Path
                d="M 46.5 62 Q 50 67 53.5 62 Q 50 59 46.5 62 Z"
                fill="#FF8A9E"
              />
              <Path
                d="M 43 58 Q 50 62 57 58"
                fill="none"
                stroke="#2C1E14"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
            </G>
          ) : expression === 'thinking' ? (
            /* Subtle curious curved smile */
            <Path
              d="M 47 58 Q 51 61 54 58"
              fill="none"
              stroke="#2C1E14"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          ) : (
            /* Idle: Gentle sweet puppy smile */
            <G>
              <Path
                d="M 45 58 Q 47.5 61 50 58"
                fill="none"
                stroke="#2C1E14"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
              <Path
                d="M 50 58 Q 52.5 61 55 58"
                fill="none"
                stroke="#2C1E14"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
            </G>
          )}
        </Svg>
      </View>
    );
  }

  // -------------------------------------------------------------
  // VARIANT: FULL (Complete Caregiver Companion Character)
  // -------------------------------------------------------------
  return (
    <View
      accessibilityRole="image"
      style={[{ height: size, width: size }, style]}
      testID={testID}
    >
      <Svg height={size} viewBox="0 0 120 120" width={size}>
        <Defs>
          <LinearGradient id="coatGradFull" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" stopColor="#E5A866" />
            <Stop offset="100%" stopColor="#C77C36" />
          </LinearGradient>
          <LinearGradient id="scrubGradFull" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" stopColor="#2D6A4F" />
            <Stop offset="100%" stopColor="#1B4D3E" />
          </LinearGradient>
          <LinearGradient id="earInnerGradFull" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" stopColor="#FAD2C8" />
            <Stop offset="100%" stopColor="#F5B8A7" />
          </LinearGradient>
        </Defs>

        {/* 1. Tail (Aspin upward curved tail with wag) */}
        {!pose?.hideTail && (
          <Path
            d={
              expression === 'celebration'
                ? 'M 84 84 Q 106 72 102 54 Q 96 50 94 62 Q 90 76 80 84 Z'
                : 'M 82 86 Q 102 80 98 64 Q 93 62 90 72 Q 86 82 78 86 Z'
            }
            fill="url(#coatGradFull)"
          />
        )}

        {/* 2. Hind Feet / Paws */}
        <Ellipse cx="36" cy="108" fill="#C77C36" rx="8" ry="4.5" />
        <Ellipse cx="84" cy="108" fill="#C77C36" rx="8" ry="4.5" />

        {/* 3. Scrub Body Tunic */}
        <Path
          d="M 38 68 Q 30 76 34 102 L 86 102 Q 90 76 82 68 Z"
          fill="url(#scrubGradFull)"
        />

        {/* Scrub Trim Hem */}
        <Path
          d="M 34 102 L 86 102"
          fill="none"
          stroke="#143A2F"
          strokeWidth="2.5"
        />

        {/* Scrub Pocket with mini Medical Cross */}
        <Rect
          fill="#245A42"
          height="12"
          rx="2"
          stroke="#1B4D3E"
          strokeWidth="1"
          width="11"
          x="68"
          y="80"
        />
        <Rect fill="#D8F3DC" height="6" rx="0.5" width="2" x="72.5" y="83" />
        <Rect fill="#D8F3DC" height="2" rx="0.5" width="6" x="70.5" y="85" />

        {/* Stethoscope around neck down onto tunic */}
        <Path
          d="M 45 64 Q 60 88 74 72"
          fill="none"
          stroke="#52B788"
          strokeLinecap="round"
          strokeWidth="2.6"
        />
        <Circle cx="74" cy="72" fill="#E2ECE5" r="3.5" stroke="#1B4D3E" strokeWidth="1" />
        <Circle cx="74" cy="72" fill="#52B788" r="1.5" />

        {/* 4. Front Paws (Resting gently forward) */}
        {!pose?.hideFrontPaws && <G>
          {/* Left Front Leg & Paw */}
          <Path
            d="M 44 90 L 46 108 Q 50 110 54 108 L 53 90 Z"
            fill="url(#coatGradFull)"
          />
          <Ellipse cx="50" cy="107" fill="#FDF5EB" rx="4.5" ry="3" />
          <Circle cx="48" cy="106" fill="#D9944D" r="0.8" />
          <Circle cx="50" cy="106" fill="#D9944D" r="0.8" />
          <Circle cx="52" cy="106" fill="#D9944D" r="0.8" />

          {/* Right Front Leg & Paw */}
          <Path
            d="M 67 90 L 66 108 Q 70 110 74 108 L 76 90 Z"
            fill="url(#coatGradFull)"
          />
          <Ellipse cx="70" cy="107" fill="#FDF5EB" rx="4.5" ry="3" />
          <Circle cx="68" cy="106" fill="#D9944D" r="0.8" />
          <Circle cx="70" cy="106" fill="#D9944D" r="0.8" />
          <Circle cx="72" cy="106" fill="#D9944D" r="0.8" />
        </G>}

        {/* 5. Neck */}
        <Rect fill="#D9944D" height="12" rx="3" width="20" x="50" y="56" />

        {/* 6. Ears (Aspin triangular floppy ears) */}
        {expression === 'thinking' ? (
          <>
            <G transform="rotate(-15 36 34)">
              <Path
                d="M 34 38 Q 20 24 28 12 Q 40 14 42 28 Z"
                fill="url(#coatGradFull)"
              />
              <Path
                d="M 32 34 Q 24 24 29 16 Q 37 17 38 27 Z"
                fill="url(#earInnerGradFull)"
              />
            </G>
            <G transform="rotate(6 84 36)">
              <Path
                d="M 86 38 Q 100 28 92 16 Q 80 16 78 30 Z"
                fill="url(#coatGradFull)"
              />
              <Path
                d="M 88 34 Q 95 26 90 20 Q 82 20 82 28 Z"
                fill="url(#earInnerGradFull)"
              />
            </G>
          </>
        ) : expression === 'celebration' ? (
          <>
            <G transform="rotate(-8 36 30)">
              <Path
                d="M 36 36 Q 20 20 32 8 Q 44 12 44 26 Z"
                fill="url(#coatGradFull)"
              />
              <Path
                d="M 34 32 Q 24 20 32 12 Q 40 15 40 24 Z"
                fill="url(#earInnerGradFull)"
              />
            </G>
            <G transform="rotate(8 84 30)">
              <Path
                d="M 84 36 Q 100 20 88 8 Q 76 12 76 26 Z"
                fill="url(#coatGradFull)"
              />
              <Path
                d="M 86 32 Q 96 20 88 12 Q 80 15 80 24 Z"
                fill="url(#earInnerGradFull)"
              />
            </G>
          </>
        ) : (
          <>
            <Path
              d="M 38 36 Q 22 28 30 16 Q 42 18 44 32 Z"
              fill="url(#coatGradFull)"
            />
            <Path
              d="M 36 34 Q 26 27 31 19 Q 39 21 40 30 Z"
              fill="url(#earInnerGradFull)"
            />
            <Path
              d="M 82 36 Q 98 28 90 16 Q 78 18 76 32 Z"
              fill="url(#coatGradFull)"
            />
            <Path
              d="M 84 34 Q 94 27 89 19 Q 81 21 80 30 Z"
              fill="url(#earInnerGradFull)"
            />
          </>
        )}

        {/* 7. Head Shape */}
        <Ellipse cx="60" cy="42" fill="url(#coatGradFull)" rx="24" ry="21" />

        {/* Forehead Highlights */}
        <Path
          d="M 54 23 Q 60 19 66 23 Q 60 27 54 23 Z"
          fill="#F3C79A"
          opacity="0.8"
        />

        {/* 8. Medical Caregiver Cap */}
        <G>
          <Path
            d="M 46 24 Q 60 19 74 24 L 71 15 Q 60 12 49 15 Z"
            fill="#FFFFFF"
            stroke="#D6E2DA"
            strokeLinejoin="round"
            strokeWidth="1.2"
          />
          <Rect fill="#2D6A4F" height="6" rx="0.6" width="2" x="59" y="15" />
          <Rect fill="#2D6A4F" height="2" rx="0.6" width="6" x="57" y="17" />
        </G>

        {/* 9. Muzzle & Cheeks */}
        <Ellipse cx="60" cy="49" fill="#FDF5EB" rx="13" ry="9.5" />
        <Ellipse
          cx="44"
          cy="47"
          fill="#F8A599"
          opacity={expression === 'celebration' ? '0.75' : '0.4'}
          rx={expression === 'celebration' ? '4.8' : '3.8'}
          ry="2.8"
        />
        <Ellipse
          cx="76"
          cy="47"
          fill="#F8A599"
          opacity={expression === 'celebration' ? '0.75' : '0.4'}
          rx={expression === 'celebration' ? '4.8' : '3.8'}
          ry="2.8"
        />

        {/* 10. Eyes & Eyebrows */}
        {expression === 'celebration' ? (
          <>
            <Path
              d="M 45 39 Q 50 33 55 39"
              fill="none"
              stroke="#2D1C10"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            <Path
              d="M 65 39 Q 70 33 75 39"
              fill="none"
              stroke="#2D1C10"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            <Path
              d="M 46 32 Q 50 28 54 31"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <Path
              d="M 66 31 Q 70 28 74 32"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </>
        ) : expression === 'thinking' ? (
          <>
            <Ellipse cx="50" cy="38" fill="#2D1C10" rx="4" ry="4.6" />
            <Circle cx="51.5" cy="36.5" fill="#FFFFFF" r="1.6" />
            <Circle cx="49" cy="40" fill="#FFFFFF" r="0.8" />

            <Ellipse cx="70" cy="37" fill="#2D1C10" rx="4" ry="4.6" />
            <Circle cx="71.5" cy="35.5" fill="#FFFFFF" r="1.6" />
            <Circle cx="69" cy="39" fill="#FFFFFF" r="0.8" />

            <Path
              d="M 46 31 Q 50 33 54 32"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <Path
              d="M 66 29 Q 71 25 76 30"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </>
        ) : (
          <>
            <Ellipse cx="50" cy="38.5" fill="#2D1C10" rx="4.2" ry="4.8" />
            <Circle cx="48.8" cy="37" fill="#FFFFFF" r="1.7" />
            <Circle cx="51.8" cy="40.2" fill="#FFFFFF" r="0.8" />

            <Ellipse cx="70" cy="38.5" fill="#2D1C10" rx="4.2" ry="4.8" />
            <Circle cx="68.8" cy="37" fill="#FFFFFF" r="1.7" />
            <Circle cx="71.8" cy="40.2" fill="#FFFFFF" r="0.8" />

            <Path
              d="M 47 31 Q 50 28 54 31"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <Path
              d="M 66 31 Q 70 28 73 31"
              fill="none"
              stroke="#9A531A"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </>
        )}

        {/* 11. Nose */}
        <Path
          d="M 57 44 Q 60 42 63 44 Q 64 47 60 49 Q 56 47 57 44 Z"
          fill="#2C1E14"
        />
        <Circle cx="59" cy="44.5" fill="#FFFFFF" opacity="0.6" r="0.9" />

        {/* 12. Mouth */}
        {expression === 'celebration' ? (
          <G>
            <Path
              d="M 55 49 Q 60 57 65 49 Z"
              fill="#8C1C13"
            />
            <Path
              d="M 57 52 Q 60 56 63 52 Z"
              fill="#FF8A9E"
            />
            <Path
              d="M 54 49 Q 60 52 66 49"
              fill="none"
              stroke="#2C1E14"
              strokeLinecap="round"
              strokeWidth="1.3"
            />
          </G>
        ) : expression === 'thinking' ? (
          <Path
            d="M 57 49 Q 61 51 63 49"
            fill="none"
            stroke="#2C1E14"
            strokeLinecap="round"
            strokeWidth="1.4"
          />
        ) : (
          <G>
            <Path
              d="M 56 49 Q 58 51 60 49"
              fill="none"
              stroke="#2C1E14"
              strokeLinecap="round"
              strokeWidth="1.3"
            />
            <Path
              d="M 60 49 Q 62 51 64 49"
              fill="none"
              stroke="#2C1E14"
              strokeLinecap="round"
              strokeWidth="1.3"
            />
          </G>
        )}
        {pose?.layer}
      </Svg>
    </View>
  );
}
