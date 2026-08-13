// src/components/ScoreRing.js
// Animated circular score indicator

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, FONTS } from '../constants/theme';

const SIZE = 140;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const scoreColor = (score) => {
  if (score >= 80) return COLORS.successGreen;
  if (score >= 50) return COLORS.warnAmber;
  return COLORS.dangerRed;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ScoreRing({ score = 0 }) {
  const animatedScore = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedScore, {
      toValue: score,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const strokeDashoffset = animatedScore.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const color = scoreColor(score);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        {/* Background track */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke="rgba(255,255,255,0.1)"
          strokeWidth={10}
        />
        {/* Score arc */}
        <AnimatedCircle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={color}
          strokeWidth={10}
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>
      <View style={styles.label}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={styles.scoreText}>SHIELD SCORE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    transform: [{ rotate: '-90deg' }],
    position: 'absolute',
  },
  label: {
    alignItems: 'center',
  },
  scoreNum: {
    fontSize: 34,
    fontWeight: FONTS.black,
    lineHeight: 38,
  },
  scoreText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: FONTS.semibold,
    letterSpacing: 1,
  },
});
