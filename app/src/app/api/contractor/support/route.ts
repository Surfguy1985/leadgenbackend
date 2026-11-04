import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, adminDb, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";
export const runtime="nodejs";
const Input=z.object({
 category:z.enum(["account","listing","billing","safety","accessibility","other"]),
 message:z.string().trim().min(15).max(2000),
});
/** Authenticated human support queue. No automatic promise of email delivery. */
export async function POST(req:Request) {
 if(!rateLimit(`support:${clientIp(req)}`,5,60_000))return NextResponse.json({error:"rate_limited"},{status:429});
 const user=await currentUser();
 if(!user?.user.email_confirmed_at)return NextResponse.json({error:"verified_sign_in_required"},{status:401});
 const p=Input.safeParse(await req.json().catch(()=>null));
 if(!p.success)return NextResponse.json({error:"invalid",issues:p.error.issues.map(x=>x.message)},{status:422});
 const db=adminDb();
 const {data,error}=await db.from("moderation_queue").insert({
   case_type:"support",priority:p.data.category==="safety"?"P1":"P2",reason:p.data.category,
   details:{user_id:user.user.id,request:p.data.message,source:"authenticated_support",at:new Date().toISOString()}
 }).select("id").single();
 if(error||!data)return NextResponse.json({error:"support_queue_unavailable"},{status:503});
 await audit(user.user.id,"support_case_created","moderation_queue",data.id,{category:p.data.category});
 return NextResponse.json({ok:true,id:data.id,message:"Your support request is in the review queue."},{status:201});
}
