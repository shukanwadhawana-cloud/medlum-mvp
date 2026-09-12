import { NextResponse } from "next/server";
import { clearPortalSession } from "@/lib/portal-session";
export async function POST(){ await clearPortalSession(); return NextResponse.json({success:true}); }
