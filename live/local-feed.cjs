'use strict';
/** Event feed tailer. Explicit local user-selected JSONL, never creates a
 * network listener, never touches Deadlock files, never starts another app. */
const fs=require('node:fs');
const {EventState}=require('./event-state.cjs');
const MAX_LINE=16384, MAX_BACKLOG=256*1024;
class LocalFeed {
 constructor({onState=()=>{},onError=()=>{},fsModule=fs}={}){this.fs=fsModule;this.onState=onState;this.onError=onError;this.stop();}
 start(file){
   this.stop();
   const stat=this.fs.statSync(file);
   if(!stat.isFile())throw new Error('Select a regular JSON Lines file');
   if(stat.size>5*1024*1024)throw new Error('Feed file too large (5 MB maximum at selection)');
   this.file=file;this.offset=0;this.pending='';this.state=new EventState();
   // First poll reads initial events. This file is read ONLY after a user selects it.
   this.poll();
   this.timer=setInterval(()=>this.poll(),1200);
   return this.state.snapshot();
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.file=null;this.offset=0;this.pending='';this.state=new EventState();}
 poll(){
   if(!this.file)return;
   try{
     const stat=this.fs.statSync(this.file);
     if(!stat.isFile())throw new Error('Feed is no longer a regular file');
     if(stat.size<this.offset){this.offset=0;this.pending='';this.state.clear();}
     const newBytes=stat.size-this.offset;
     if(!newBytes)return;
     if(newBytes>MAX_BACKLOG)throw new Error('Feed produced too much data between checks');
     const fd=this.fs.openSync(this.file,'r');let readBuffer;
     try{readBuffer=Buffer.alloc(newBytes);let got=0;while(got<newBytes){const n=this.fs.readSync(fd,readBuffer,got,newBytes-got,this.offset+got);if(!n)break;got+=n;}readBuffer=readBuffer.subarray(0,got);this.offset+=got;}
     finally{this.fs.closeSync(fd);}
     this.pending+=readBuffer.toString('utf8');
     if(this.pending.length>MAX_BACKLOG)throw new Error('Event buffer exceeded size limit');
     let pos;
     while((pos=this.pending.indexOf('\n'))!==-1){
       const line=this.pending.slice(0,pos).trim();this.pending=this.pending.slice(pos+1);
       if(!line)continue;
       if(line.length>MAX_LINE)throw new Error('Event line exceeded size limit');
       this.state.apply(JSON.parse(line));
       this.onState(this.state.snapshot());
     }
   }catch(e){this.onError('Event feed stopped: '+String(e.message).slice(0,170));this.stop();}
 }
}
module.exports={LocalFeed};
