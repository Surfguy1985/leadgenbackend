import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid=z.string().uuid();
const Save=z.object({
 label:z.string().trim().min(2).max(80),
 query:z.string().trim().max(160).default(""),
 trade:z.string().max(80).nullable().optional(),
 zip:z.string().regex(/^\d{5}$/).nullable().optional(),
 tab:z.enum(["jobs_now","upcoming","buyers"]),
});
async function contractor() {
 const u=await currentUser();if(!u)return null;
 const {data:org}=await u.db.from("organizations").select("id").eq("owner_user_id",u.user.id).eq("kind","contractor").maybeSingle();if(!org)return null;
 const {data:profile}=await u.db.from("contractor_profiles").select("id").eq("organization_id",org.id).maybeSingle();
 return profile?{db:u.db,id:profile.id}:null;
}
export async function GET() {
 const u=await contractor();if(!u)return NextResponse.json({error:"unauthorized_or_not_onboarded"},{status:401});
 const {data,error}=await u.db.from("saved_searches").select("id,label,query,trade,zip,tab,created_at").eq("contractor_id",u.id).order("created_at",{ascending:false}).limit(10);
 if(error)return NextResponse.json({error:"unavailable"},{status:503});
 return NextResponse.json({items:data??[]},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request) {
 if(!rateLimit(`saved_search:${clientIp(req)}`,12,60000))return NextResponse.json({error:"rate_limited"},{status:429});
 const u=await contractor();if(!u)return NextResponse.json({error:"unauthorized_or_not_onboarded"},{status:401});
 const parsed=Save.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"invalid"},{status:422});
 const {count,error:ce}=await u.db.from("saved_searches").select("id",{count:"exact",head:true}).eq("contractor_id",u.id);
 if(ce)return NextResponse.json({error:"unavailable"},{status:503});
 if((count??0)>=10)return NextResponse.json({error:"limit_reached",message:"You can keep up to 10 saved searches. Remove one first."},{status:409});
 const {data,error}=await u.db.from("saved_searches").insert({contractor_id:u.id,...parsed.data}).select("id").single();
 if(error)return NextResponse.json({error:"save_failed"},{status:503});
 return NextResponse.json({ok:true,id:data.id},{status:201});
}
export async function DELETE(req:Request) {
 const u=await contractor();if(!u)return NextResponse.json({error:"unauthorized_or_not_onboarded"},{status:401});
 const id=new URL(req.url).searchParams.get("id");
 if(!id||!uuid.safeParse(id).success)return NextResponse.json({error:"invalid"},{status:422});
 const {error}=await u.db.from("saved_searches").delete().eq("id",id).eq("contractor_id",u.id);
 return error?NextResponse.json({error:"delete_failed"},{status:503}):NextResponse.json({ok:true});
}
