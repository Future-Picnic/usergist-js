import {expect,it} from 'vitest'
import {PresentationGate} from '@usergist/sdk-core/mobile'
import {inAppScreenAllowed} from './inapp-screen.js'
import {createModalQueue} from './modal-queue.js'
it('revalidates current screen when a queued presentation is released',()=>{
 const message={screenAllowlist:['events'],screenDenylist:[]}
 let screen='events',releaseActive=()=>{},shown=0,next=0
 const queue=createModalQueue(),gate=new PresentationGate()
 queue.enqueue(release=>{releaseActive=release})
 queue.enqueue(release=>gate.runWhenReady(()=>{shown++;release()},()=>inAppScreenAllowed(message,screen),release))
 queue.enqueue(release=>{next++;release()})
 screen='identity';releaseActive()
 expect(shown).toBe(0);expect(next).toBe(1)
 expect(inAppScreenAllowed({...message,screenDenylist:['events']},'events')).toBe(false)
 expect(inAppScreenAllowed(message,undefined)).toBe(false)
})
