'use strict';
/** Event feed tailer. Explicit local user-selected JSONL, never creates a
 * network listener, never touches Deadlock files, never starts another app. */
const fs=require('node:fs');
const {StringDecoder}=require('node:string_decoder');
const {EventState}=require('./event-state.cjs');
// One poll may read up to MAX_POLL (the initial read of a file selected at the
// 5 MB limit, or a burst of appends), in CHUNK-sized reads.
const MAX_LINE=16384, MAX_POLL=5*1024*1024, CHUNK=64*1024;
class LocalFeed {
 constructor({onState=()=>{},onError=()=>{},fsModule=fs}={}){this.fs=fsModule;this.onState=onState;this.onError=onError;this.stop();}
 start(file){
   this.stop();
   const stat=this.fs.statSync(file);
   if(!stat.isFile())throw new Error('Select a regular JSON Lines file');
   if(stat.size>MAX_POLL)throw new Error('Feed file too large (5 MB maximum at selection)');
   this.file=file;
   // First poll reads initial events. This file is read ONLY after a user selects it.
   this.poll();
   this.timer=setInterval(()=>this.poll(),1200);
   return this.state.snapshot();
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.file=null;this.reset();}
 reset(){this.offset=0;this.pending='';this.decoder=new StringDecoder('utf8');this.state=new EventState();}
 poll(){
   if(!this.file)return;
   // Apply every complete line, then publish one snapshot: a large initial file
   // must not trigger a renderer update per line.
   this.dirty=false;
   try{
     const stat=this.fs.statSync(this.file);
     if(!stat.isFile())throw new Error('Feed is no longer a regular file');
     if(stat.size<this.offset)this.reset(); // truncated or replaced: start over
     const newBytes=stat.size-this.offset;
     if(!newBytes)return;
     if(newBytes>MAX_POLL)throw new Error('Feed produced too much data between checks');
     const fd=this.fs.openSync(this.file,'r');
     try{
       const buffer=Buffer.alloc(Math.min(CHUNK,newBytes));
       for(let left=newBytes;left>0;){
         const n=this.fs.readSync(fd,buffer,0,Math.min(buffer.length,left),this.offset);
         if(!n)break;
         this.offset+=n;left-=n;
         // The decoder holds back a multi-byte character split across reads.
         this.pending+=this.decoder.write(buffer.subarray(0,n));
         this.drainLines();
       }
     }finally{this.fs.closeSync(fd);}
   }catch(e){
     if(this.dirty)this.onState(this.state.snapshot());
     this.onError('Event feed stopped: '+String(e.message).slice(0,170));this.stop();return;
   }
   if(this.dirty)this.onState(this.state.snapshot());
 }
 drainLines(){
   const end=this.pending.lastIndexOf('\n');
   if(end!==-1){
     const lines=this.pending.slice(0,end).split('\n');this.pending=this.pending.slice(end+1);
     for(const raw of lines){
       const line=raw.trim();
       if(!line)continue;
       if(line.length>MAX_LINE)throw new Error('Event line exceeded size limit');
       this.state.apply(JSON.parse(line));this.dirty=true;
     }
   }
   if(this.pending.length>MAX_LINE)throw new Error('Event line exceeded size limit');
 }
}
module.exports={LocalFeed};
