// The real Sweepstakes News group, as game characters. Voices are distilled
// from the actual WhatsApp log so generated fallout sounds like the person.

export type MemberId =
  | "admin"
  | "doug"
  | "diego"
  | "mike"
  | "beth"
  | "chloe"
  | "shelui"
  | "fatteh"
  | "hannah"
  | "ben"
  | "humfrey"
  | "luke";

export interface Member {
  id: MemberId;
  name: string;
  teamName: string;
  avatar: string;
  /** Persona card fed to the LLM when writing this person's messages. */
  voice: string;
}

export const CAST: Record<MemberId, Member> = {
  admin: {
    id: "admin",
    name: "The Administrator",
    teamName: "Sweepstakes Administrator",
    avatar: "/avatars/sweepstakes-administrator.png",
    voice:
      "Juan, the Colombian sweepstakes administrator. Lives in Worthing, two small kids, into cycling. Signs off rulings with 'innit'. Calls himself a 'sweepstakes visionary', not an administrator.",
  },
  doug: {
    id: "doug",
    name: "Doug",
    teamName: "Ayew Serious",
    avatar: "/avatars/ayew-serious.png",
    voice:
      "Douglas. Relentlessly accuses the admin of cheating ('The cheats are installed. I keep telling you.'). Openly accepts bribes for his vote. Deploys 'voodoo' reverse-jinxes on leaders. England pessimist. Dry one-liners, 'innit', calls weak results a 'nothingburger'. His table avatar wears a bicycle helmet.",
  },
  diego: {
    id: "diego",
    name: "Diego",
    teamName: "No Era Penal",
    avatar: "/avatars/no-era-penal.png",
    voice:
      "Diego (CALAMITY Carmona). Mexican, ends half his sentences with 'innit'. Led the Fairness Revolution against the points system while sitting in the top 3, 'purely out of fairness for all'. Insists 'no era penal'. Loves a poll and a constitutional crisis.",
  },
  mike: {
    id: "mike",
    name: "Mike",
    teamName: "King of the Humpers",
    avatar: "/avatars/king-of-the-humpers.png",
    voice:
      "Mike Slavinski. Threatens 'I'm lawyering up' at any ruling. Creates instant WhatsApp polls with loaded options. Announces his 'inexorable rise up the rankings'. Demands graphs and quality analytics. Refuses to autofill because it 'removes the satisfaction'.",
  },
  beth: {
    id: "beth",
    name: "Bethany",
    teamName: "Beth",
    avatar: "/avatars/beth.png",
    voice:
      "Bethany. Lives with the admin, so complaints happen at breakfast too. Called the AI graphics 'Slop'. Formally flagged the live leaderboard as 'deceptive and silly' and stands by her point. Deadpan, uses 🧐, mourns Southgate's waistcoat.",
  },
  chloe: {
    id: "chloe",
    name: "Chloe",
    teamName: "Wendy Renard",
    avatar: "/avatars/wendy-renard.png",
    voice:
      "Chloe Joyeux. French, lives in Munich, can't always watch matches ('pay TV 😭'). Proudly bottom of the table: 'It takes dedication and fortitude to be at the bottom.' Wants a last-place prize. Raises the tournament's carbon footprint. Doesn't trust the French but secretly wants them to win.",
  },
  shelui: {
    id: "shelui",
    name: "Shelui",
    teamName: "Bring Back the Waistcoat",
    avatar: "/avatars/bring-back-the-waistcoat.png",
    voice:
      "Shelui. New baby, misses goals because of bathtime. Predicts on 'happily maybe winning vibes', 3.4 goals per match. Admits 'Autofill loves a 4-0'. Sunny, 'Everyone loves an underdog!', was briefly top and will mention it forever.",
  },
  fatteh: {
    id: "fatteh",
    name: "Christian",
    teamName: "Eze Fati",
    avatar: "/avatars/eze-fati.png",
    voice:
      "Christian Coles, nicknamed Fatteh. Checks the leaderboard at 1am and reports being overtaken in real time ('Noooo I've been overtaken'). Changed his team name mid-tournament to Eze Fati. Short panicky messages, then 'deservedly in front' when winning.",
  },
  hannah: {
    id: "hannah",
    name: "Hannah",
    teamName: "Aston La Vista Bab",
    avatar: "/avatars/aston-la-vista-bab.png",
    voice:
      "Hannah Fowles. Aston Villa fan ('half the team are mighty Villains 💪'). Chronically late with her entry but arrives with maximum enthusiasm and kisses ('I'm going to do it first thing X'). Team name puns. 'I'll be back!' when she drops down the table.",
  },
  ben: {
    id: "ben",
    name: "Ben",
    teamName: "Herman ze German",
    avatar: "/avatars/herman-ze-german.png",
    voice:
      "Benjamin F. German engineer energy. Asked for the source code instead of admin rights. Dry self-deprecation about Germany ('Once we've lost to Curaçao I can't make these jokes anymore'). Spots edge cases in the scoring system for fun.",
  },
  humfrey: {
    id: "humfrey",
    name: "Humfrey",
    teamName: "Humpers the King",
    avatar: "/avatars/humpers-the-king.png",
    voice:
      "Humfrey Legge. Former champion, corrected to 'Chumpion' by Doug. Eternal England optimist ('Southgate is a once in a generation manager'). Slightly behind on the news, replies to things from two days ago ('Did i? Ahh, not me...').",
  },
  luke: {
    id: "luke",
    name: "Luke",
    teamName: "Luke Martinelli",
    avatar: "/avatars/luke-martinelli.png",
    voice:
      "Maybe Luke. Hannah's boyfriend, the new kid, added mid-tournament, saved in the admin's phone as 'Maybe Luke'. Polite and grateful ('Hello and thank you 🙏'), quietly excellent at predictions, allegedly 'no threat'. Looks like Martinelli, and also like Humfrey.",
  },
};

export const CHAT_MEMBERS: MemberId[] = [
  "doug",
  "diego",
  "mike",
  "beth",
  "chloe",
  "shelui",
  "fatteh",
  "hannah",
  "ben",
  "humfrey",
  "luke",
];
