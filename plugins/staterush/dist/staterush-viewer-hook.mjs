#!/usr/bin/env node
import r from"node:fs";import{createHash as h,randomUUID as y}from"node:crypto";function u(e){if(!e)return[];let t=`${e}.lock`;try{r.mkdirSync(t,{mode:448})}catch{return[]}try{let o=`${e}.consumed`,n=0;try{n=Number(r.readFileSync(o,"utf8"))||0}catch{}let c=r.readFileSync(e);(n<0||n>c.length)&&(n=0);let s=c.subarray(n).toString("utf8"),a=s.lastIndexOf(`
`);if(a<0)return[];let d=s.slice(0,a).split(`
`).map(f=>JSON.parse(f)),l=`${o}.${y()}.pending`;return r.writeFileSync(l,String(n+Buffer.byteLength(s.slice(0,a+1))),{flag:"wx",mode:384}),r.renameSync(l,o),d}finally{r.rmdirSync(t)}}process.argv.includes("--help")&&(process.stdout.write(`usage: staterush-viewer-hook  (a PostToolUse/Stop/PreToolUse hook; reads the hook event JSON on stdin)
`),process.exit(0));var i;try{let e="";for await(let t of process.stdin)e+=t;i=JSON.parse(e).hook_event_name}catch{process.exit(0)}i!=="PreToolUse"&&i!=="PostToolUse"&&i!=="Stop"&&process.exit(0);try{let e=u(process.env.PULLBOARD_INPUT_INBOX);if(e.length){let t=e.map(({id:o,text:n,at:c})=>`Message from the board viewer (${o}, ${c}):
${n}`).join(`

`);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:i,additionalContext:t}}))}}catch{}
