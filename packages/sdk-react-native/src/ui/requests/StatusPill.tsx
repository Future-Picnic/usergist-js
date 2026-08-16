import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { RequestStatus } from '@usergist/sdk-core'
import { STATUS_COLOR, STATUS_LABEL } from './shared.js'

export interface StatusPillProps {
  readonly status: RequestStatus
}

export function StatusPill({ status }: StatusPillProps) {
  const color = STATUS_COLOR[status]
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color + '55', backgroundColor: color + '18' },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
    alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  text: { fontSize: 11, fontWeight: '600' },
})
