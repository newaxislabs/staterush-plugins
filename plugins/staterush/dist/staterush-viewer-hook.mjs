#!/usr/bin/env node
import r from"node:fs";import{createHash as h,randomUUID as y}from"node:crypto";function u(n){if(!n)return[];let t=`${n}.lock`;try{r.mkdirSync(t,{mode:448})}catch{return[]}try{let o=`${n}.consumed`,e=0;try{e=Number(r.readFileSync(o,"utf8"))||0}catch{}let c=r.readFileSync(n);(e<0||e>c.length)&&(e=0);let s=c.subarray(e).toString("utf8"),a=s.lastIndexOf(`
`);if(a<0)return[];let d=s.slice(0,a).split(`
`).map(f=>JSON.parse(f)),l=`${o}.${y()}.pending`;return r.writeFileSync(l,String(e+Buffer.byteLength(s.slice(0,a+1))),{flag:"wx",mode:384}),r.renameSync(l,o),d}finally{r.rmdirSync(t)}}process.argv.includes("--help")&&(process.stdout.write(`usage: staterush-viewer-hook  (a PostToolUse/Stop/PreToolUse hook; reads the hook event JSON on stdin)
`),process.exit(0));var i;try{let n="";for await(let t of process.stdin)n+=t;i=JSON.parse(n).hook_event_name}catch{process.exit(0)}i!=="PreToolUse"&&i!=="PostToolUse"&&i!=="Stop"&&process.exit(0);try{let n=u(process.env.PULLBOARD_INPUT_INBOX);if(n.length){let t=n.map(({id:o,text:e,at:c})=>`Message from the board viewer (${o}, ${c}):
${e}`).join(`

`);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:i,additionalContext:t}}))}}catch{}
