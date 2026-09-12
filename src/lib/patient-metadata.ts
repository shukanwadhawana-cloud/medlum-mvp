export const CARE_MARKER = /(?:^|\n)__MEDLUM_CARE_SETTING__:(OPD|IPD)\n?/;
export const PROFILE_MARKER = /(?:^|\n)__MEDLUM_PROFILE__:(\{[^\n]*\})\n?/;
export function parseCareSetting(notes:string){const m=String(notes||"").match(CARE_MARKER);return m?.[1]==="IPD"?"IPD":"OPD";}
export function parsePatientProfile(notes:string){const m=String(notes||"").match(PROFILE_MARKER);if(!m)return{};try{return JSON.parse(m[1])}catch{return{}}}
export function cleanPatientNotes(notes:string){return String(notes||"").replace(CARE_MARKER,"").replace(PROFILE_MARKER,"").trim()}
export function encodePatientNotes(notes:string,careSetting:"OPD"|"IPD",profile:Record<string,unknown>={}){return [`__MEDLUM_CARE_SETTING__:${careSetting}`,Object.keys(profile).length?`__MEDLUM_PROFILE__:${JSON.stringify(profile)}`:"",cleanPatientNotes(notes)].filter(Boolean).join("\n").trim()}
