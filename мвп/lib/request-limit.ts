export async function limitedBody(req:Request,maxBytes:number){
 if(Number(req.headers.get('content-length')??0)>maxBytes)throw new Error('Слишком большой запрос.');
 const reader=req.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error('Слишком большой запрос.');}chunks.push(value);}
 const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}return body;
}
