#!/usr/bin/env node
import r from"node:fs";import{createHash as h,randomUUID as y}from"node:crypto";function l(e){if(!e)return[];let n=`${e}.lock`;try{r.mkdirSync(n,{mode:448})}catch{return[]}try{let o=`${e}.consumed`,t=0;try{t=Number(r.readFileSync(o,"utf8"))||0}catch{}let i=r.readFileSync(e);(t<0||t>i.length)&&(t=0);let c=i.subarray(t).toString("utf8"),a=c.lastIndexOf(`
`);if(a<0)return[];let d=c.slice(0,a).split(`
`).map(f=>JSON.parse(f)),u=`${o}.${y()}.pending`;return r.writeFileSync(u,String(t+Buffer.byteLength(c.slice(0,a+1))),{flag:"wx",mode:384}),r.renameSync(u,o),d}finally{r.rmdirSync(n)}}process.argv.includes("--help")&&(process.stdout.write(`usage: staterush-viewer-hook  (a Claude Code PostToolUse/Stop hook; reads the hook event JSON on stdin)
`),process.exit(0));var s;try{let e="";for await(let n of process.stdin)e+=n;s=JSON.parse(e).hook_event_name}catch{process.exit(0)}s!=="PostToolUse"&&s!=="Stop"&&process.exit(0);try{let e=l(process.env.PULLBOARD_INPUT_INBOX);if(e.length){let n=e.map(({id:o,text:t,at:i})=>`Message from the board viewer (${o}, ${i}):
${t}`).join(`

`);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:s,additionalContext:n}}))}}catch{}
