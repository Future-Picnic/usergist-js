import React from 'react'
import { Image, StyleSheet, View } from 'react-native'

interface Props {
  readonly uri: string
  readonly radius: number
}

/**
 * Renders an optional question photo above the question title.
 * Fixed 16:9 aspect, theme corner radius, native `<Image>` caching.
 */
export function QuestionImageHeader({ uri, radius }: Props): React.ReactElement {
  return (
    <View style={[styles.wrap, { borderRadius: radius }]}>
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
