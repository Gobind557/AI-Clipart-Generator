import { useEffect, useRef, type ReactElement } from "react";
import { Animated, StyleSheet, View } from "react-native";

type Props = {
  height?: number;
};

export function SkeletonTile({ height = 120 }: Props): ReactElement {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={[styles.wrap, { height }]}>
      <Animated.View style={[styles.shimmer, { opacity }]} />
      <View style={styles.barShort} />
      <View style={styles.barLong} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    backgroundColor: "#252b38",
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 10,
    gap: 6
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#3d4a63"
  },
  barShort: {
    height: 8,
    width: "45%",
    borderRadius: 4,
    backgroundColor: "#1f2430"
  },
  barLong: {
    height: 8,
    width: "70%",
    borderRadius: 4,
    backgroundColor: "#1f2430"
  }
});
