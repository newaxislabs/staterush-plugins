#!/usr/bin/env node
var f=!1;function l(t,e){if(!e?.startsWith("PULLBOARD_"))return t[e];let n=`STATERUSH_${e.slice(10)}`;if(Object.hasOwn(t,n))return t[n];if(Object.hasOwn(t,e))return f||(f=!0,process.stderr.write(`${e} is deprecated; use ${n} instead.
`)),t[e]}import o from"node:fs";import{createHash as L,randomUUID as y}from"node:crypto";function d(t){if(!t)return[];let e=`${t}.lock`;try{o.mkdirSync(e,{mode:448})}catch{return[]}try{let n=`${t}.consumed`,r=0;try{r=Number(o.readFileSync(n,"utf8"))||0}catch{}let s=o.readFileSync(t);(r<0||r>s.length)&&(r=0);let c=s.subarray(r).toString("utf8"),a=c.lastIndexOf(`
`);if(a<0)return[];let p=c.slice(0,a).split(`
`).map(S=>JSON.parse(S)),u=`${n}.${y()}.pending`;return o.writeFileSync(u,String(r+Buffer.byteLength(c.slice(0,a+1))),{flag:"wx",mode:384}),o.renameSync(u,n),p}finally{o.rmdirSync(e)}}process.argv.includes("--help")&&(process.stdout.write(`usage: staterush-viewer-hook  (a PostToolUse/Stop/PreToolUse hook; reads the hook event JSON on stdin)
`),process.exit(0));var i;try{let t="";for await(let e of process.stdin)t+=e;i=JSON.parse(t).hook_event_name}catch{process.exit(0)}i!=="PreToolUse"&&i!=="PostToolUse"&&i!=="Stop"&&process.exit(0);try{let t=d(l(process.env,"PULLBOARD_INPUT_INBOX"));if(t.length){let e=t.map(({id:n,text:r,at:s})=>`Message from the board viewer (${n}, ${s}):
${r}`).join(`

`);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:i,additionalContext:e}}))}}catch{}
