import { useId } from "react";
import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { COMPASS_LETTERS, MARK, MARK_VIEWBOX, NEO_IN_WORDMARK, WORDMARK_VIEWBOX } from "./paths";

/**
 * The Compass Neo mark: the Neo blue dial with its glinting rim and the needle, north in red. `heading` turns the
 * needle (degrees, 0 is north), as the sign-in screen's sync gauge does on the web.
 */
export function NeoMark({ size = 52, heading = 0, label }: { size?: number; heading?: number; label?: string }) {
  const c = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width={size} height={size} viewBox={MARK_VIEWBOX} accessibilityLabel={label} accessible={!!label}>
      <Defs>
        <LinearGradient id={`${id}d`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.neo} stopOpacity={0.95} />
          <Stop offset="1" stopColor={c.neo} stopOpacity={0.5} />
        </LinearGradient>
        <LinearGradient id={`${id}r`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.6} />
          <Stop offset="0.493" stopColor="#fff" stopOpacity={0} />
          <Stop offset="0.997" stopColor="#fff" stopOpacity={0.3} />
        </LinearGradient>
        <LinearGradient id={`${id}s`} x1="19.5408" y1="25.4765" x2="32.4811" y2="38.4163" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.8} />
          <Stop offset="0.519" stopColor="#fff" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0.6} />
        </LinearGradient>
        <LinearGradient id={`${id}n`} x1="19.5374" y1="13.6024" x2="32.4776" y2="26.5422" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.needle} stopOpacity={0.95} />
          <Stop offset="1" stopColor={c.needle} stopOpacity={0.5} />
        </LinearGradient>
      </Defs>
      <Path d={MARK.dial} fill={`url(#${id}d)`} />
      <Path d={MARK.rim} fill={`url(#${id}r)`} />
      <G rotation={heading} origin="26, 26">
        <Path d={MARK.south} fill={`url(#${id}s)`} />
        <Path d={MARK.north} fill={`url(#${id}n)`} />
      </G>
    </Svg>
  );
}

/** "compass" in the text colour and "neo" in Neo blue. Height sets the size. */
export function Wordmark({ height = 22 }: { height?: number }) {
  const c = useTheme();
  return (
    <Svg height={height} width={(height * 342) / 40} viewBox={WORDMARK_VIEWBOX} accessibilityLabel="Compass Neo" accessible>
      <G fill={c.text1}>
        {COMPASS_LETTERS.map(d => (
          <Path key={d.slice(0, 16)} d={d} />
        ))}
      </G>
      <G fill={c.neo}>
        {NEO_IN_WORDMARK.map(d => (
          <Path key={d.slice(0, 16)} d={d} />
        ))}
      </G>
    </Svg>
  );
}
