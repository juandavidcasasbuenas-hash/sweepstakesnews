// The crisis bank. Every dilemma is mined from a real incident in the group
// chat log, with hand-tuned meter effects so daily runs are comparable —
// the LLM writes flavour, never scores (see engine.ts).
//
// Writing rules (Juan's feedback): intros are short and punchy — 2-4 lines,
// nothing over ~90 chars. Every choice label is a message the admin actually
// SENDS to the chat, first person, so picking it reads naturally in-thread.

import type { MemberId } from "./cast";

export interface ChatLine {
  speaker: MemberId;
  text: string;
}

export type Tone = "diplomat" | "chaos" | "rulebook" | "coward";

export interface MeterEffects {
  trust: number;
  heat: number;
  integrity: number;
  banter: number;
}

export interface Choice {
  /** Button label = the message the admin sends to the group. */
  label: string;
  tone: Tone;
  effects: MeterEffects;
  /** Steer for the LLM writing the group's reaction. */
  falloutHint: string;
  /** Canned reaction used if the text API is down. */
  fallback: ChatLine[];
  badge?: string;
}

export interface Dilemma {
  id: string;
  headline: string;
  kicker: string;
  intro: ChatLine[];
  choices: [Choice, Choice, Choice];
}

// What happens when the decision clock runs out: the admin saw the crisis and
// said nothing. Costs more than any ruling — silence is the one unforgivable move.
// Harsh by design: after amplification this is roughly trust -15 / heat +18,
// so two ignored crises leave you wounded and a third one ends you.
export const DITHER: Choice = {
  label: "…",
  tone: "coward",
  effects: { trust: -10, heat: 12, integrity: -3, banter: -3 },
  falloutHint:
    "The admin read the crisis and said NOTHING — typing indicator appeared once and vanished. The group screenshots his 'online' status and turns on him.",
  fallback: [
    { speaker: "doug", text: "Seen. SEEN. The two ticks are right there." },
    { speaker: "mike", text: "Let the record show: online, and silent." },
    { speaker: "diego", text: "The silence speaks volumes innit" },
  ],
  badge: "Left Them On Read",
};

export const DILEMMAS: Dilemma[] = [
  {
    id: "cheats-installed",
    headline: "CHEAT STORM ROCKS SWEEPSTAKES",
    kicker: "Admin tops own leaderboard on day one",
    intro: [
      { speaker: "beth", text: "How come you are top already 🧐" },
      { speaker: "beth", text: "Dodgy" },
      { speaker: "doug", text: "The cheats are installed. I keep telling you." },
    ],
    choices: [
      {
        label: "Fine. Publishing EVERYONE'S predictions, timestamps and all 📋",
        tone: "rulebook",
        effects: { trust: 10, heat: -4, integrity: 6, banter: -3 },
        falloutHint:
          "The receipts land. The group grudgingly accepts them. Doug now suspects the timestamps themselves.",
        fallback: [
          { speaker: "doug", text: "Timestamps can be faked. I've seen documentaries." },
          { speaker: "ben", text: "Checked the commits. He's annoyingly clean." },
        ],
        badge: "Survived a Doug Complaint",
      },
      {
        label: "Doug's predicting the same final as me. Who's copying who? 🤔",
        tone: "chaos",
        effects: { trust: -5, heat: 6, integrity: 0, banter: 10 },
        falloutHint:
          "Deflection by counter-accusation. The chat loves the drama and picks sides. Doug is not distracted.",
        fallback: [
          { speaker: "doug", text: "Classic misdirection from a guilty man." },
          { speaker: "mike", text: "POLL: who is the real copy cat?" },
        ],
      },
      {
        label: "It's day one. Two matches have been played. Breathe. 🧘",
        tone: "diplomat",
        effects: { trust: 4, heat: -6, integrity: 2, banter: -4 },
        falloutHint: "Calm, factual, slightly boring. The group loses interest until the next match.",
        fallback: [
          { speaker: "beth", text: "I'm watching you 🧐" },
          { speaker: "shelui", text: "Months to go! Not worried 😅" },
        ],
      },
    ],
  },
  {
    id: "fairness-revolution",
    headline: "VIVA LA REVOLUCIÓN!",
    kicker: "Top-three player demands scoring overhaul 'out of fairness'",
    intro: [
      { speaker: "diego", text: "Scandal at the points system 😱 wrong result scoring nearly the same as right score. Can't be right innit" },
      { speaker: "mike", text: "POLL: Diego's Fairness Revolution (4) vs Juan's Biased Dictatorship (1)" },
      { speaker: "doug", text: "Burn it all down!" },
    ],
    choices: [
      {
        label: "Case dismissed. The rules were pinned before kickoff ⚖️",
        tone: "rulebook",
        effects: { trust: 5, heat: 8, integrity: 12, banter: -5 },
        falloutHint:
          "Diego appeals to the people. Mike announces he is lawyering up. The constitution holds, barely.",
        fallback: [
          { speaker: "diego", text: "There was no vote innit" },
          { speaker: "mike", text: "I'm lawyering up" },
        ],
        badge: "Rulebook Fundamentalist",
      },
      {
        label: "OK: launching a 'shadow table' with Diego's scoring alongside 📊",
        tone: "diplomat",
        effects: { trust: 8, heat: -6, integrity: -6, banter: 6 },
        falloutHint:
          "Everyone instantly checks the shadow table to see if they'd be better off. Alliances form accordingly.",
        fallback: [
          { speaker: "doug", text: "I'll say if it's fair once I know if I'm better off" },
          { speaker: "diego", text: "Do what's right Doug" },
        ],
        badge: "Started a Recount",
      },
      {
        label: "Interesting. We'll review after the final 👀",
        tone: "coward",
        effects: { trust: -8, heat: -8, integrity: -3, banter: 2 },
        falloutHint:
          "Temporary peace, permanent resentment. Someone quietly starts drafting a rival leaderboard.",
        fallback: [
          { speaker: "diego", text: "The revolution does not forget innit" },
          { speaker: "beth", text: "Noted. For the record. Again. 🧐" },
        ],
        badge: "The 'Checking Now' Merchant",
      },
    ],
  },
  {
    id: "deceptive-live-table",
    headline: "'DECEPTIVE AND SILLY'",
    kicker: "Admin's own household turns on live leaderboard",
    intro: [
      { speaker: "beth", text: "Flagging a very misleading feature: the leaderboard updates on LIVE scores" },
      { speaker: "beth", text: "Juan has ignored my feedback that this is deceptive and silly. Opening it to my fellow stakers" },
      { speaker: "beth", text: "I stand by my point." },
    ],
    choices: [
      {
        label: "Deploying a giant flashing 'LIVE (NOT FINAL, BETHANY)' banner 🚨",
        tone: "chaos",
        effects: { trust: 2, heat: 4, integrity: 2, banter: 10 },
        falloutHint:
          "The personalised banner is extremely funny to everyone except Bethany. You live with Bethany.",
        fallback: [
          { speaker: "beth", text: "You will regret this at dinner." },
          { speaker: "chloe", text: "Very legally binding. I love it." },
        ],
        badge: "Domestic Incident Logged",
      },
      {
        label: "Fair point. Live updates off — table now updates at full time only ✅",
        tone: "diplomat",
        effects: { trust: 6, heat: -5, integrity: 4, banter: -8 },
        falloutHint:
          "Peace at home, but Fatteh's 1am refresh ritual is ruined and he grieves loudly.",
        fallback: [
          { speaker: "fatteh", text: "So what am I supposed to refresh at 1am now" },
          { speaker: "mike", text: "Feedback actually worked?? Suspicious." },
        ],
      },
      {
        label: "Feature is working as intended. Ticket closed. 🎫",
        tone: "rulebook",
        effects: { trust: -6, heat: 7, integrity: 5, banter: 3 },
        falloutHint:
          "Closing your partner's ticket with 'working as intended' has consequences beyond the chat.",
        fallback: [
          { speaker: "beth", text: "Ticket reopened. Escalated. To the kitchen." },
          { speaker: "doug", text: "Bold man. Braver than the troops." },
        ],
        badge: "Closed the Ticket, Opened a War",
      },
    ],
  },
  {
    id: "missing-entries",
    headline: "DON'T BE 🐔S",
    kicker: "World Cup starts tomorrow — five entries missing",
    intro: [
      { speaker: "admin", text: "5 entries still missing. World Cup starts TOMORROW. Don't be 🐔s" },
      { speaker: "mike", text: "I don't have 2 hours free to predict Qatar vs Bosnia etc" },
      { speaker: "mike", text: "I don't expect this sarcasm from my sweepstake administrator" },
    ],
    choices: [
      {
        label: "Administrator? Sweepstakes VISIONARY.",
        tone: "chaos",
        effects: { trust: 0, heat: 3, integrity: 0, banter: 10 },
        falloutHint:
          "The title sticks. The chat mocks it and secretly respects it. Entries still missing though.",
        fallback: [
          { speaker: "mike", text: "The visionary can't get 11 entries in on time" },
          { speaker: "hannah", text: "Doing mine first thing X" },
        ],
        badge: "Sweepstakes Visionary",
      },
      {
        label: "Deadline extended 24h due to, er, operational reasons 📅",
        tone: "coward",
        effects: { trust: -6, heat: -4, integrity: -8, banter: 2 },
        falloutHint:
          "The punctual are furious on principle. The late promise to be late to the new deadline too.",
        fallback: [
          { speaker: "doug", text: "The on-time submitters demand compensation" },
          { speaker: "chloe", text: "Mine took 2h30. TWO HOURS THIRTY." },
        ],
        badge: "Moved the Goalposts",
      },
      {
        label: "Deadline is deadline. No entry, no glory. ⏰",
        tone: "rulebook",
        effects: { trust: 6, heat: 6, integrity: 10, banter: -4 },
        falloutHint:
          "Respect from the punctual. Panic from the stragglers. Hannah types at the speed of sound.",
        fallback: [
          { speaker: "hannah", text: "I'M IN. Unlike some referees of this tournament!!" },
          { speaker: "ben", text: "Deadline enforcement. Finally, governance." },
        ],
      },
    ],
  },
  {
    id: "autofill-scandal",
    headline: "AUTOFILL LOVES A 4-0",
    kicker: "Calls to void 'lazy' auto-filled predictions",
    intro: [
      { speaker: "shelui", text: "That's what happens when you autofill 😂 Autofill loves a 4-0" },
      { speaker: "doug", text: "Autofilled entries should get half points. Not real prediction." },
    ],
    choices: [
      {
        label: "All entries are equal before the spreadsheet 🙏",
        tone: "diplomat",
        effects: { trust: 7, heat: -5, integrity: 5, banter: -2 },
        falloutHint: "A dignified ruling. Doug demands an asterisk next to autofilled names anyway.",
        fallback: [
          { speaker: "shelui", text: "Everyone loves an underdog! Even a lazy one 🤩" },
          { speaker: "doug", text: "Fine. But I object. As usual." },
        ],
      },
      {
        label: "New column: public Effort Index™, ranking time spent per entry 📈",
        tone: "chaos",
        effects: { trust: -4, heat: 8, integrity: -4, banter: 12 },
        falloutHint:
          "The Effort Index instantly becomes the most contested metric in the game. Chloe's 2h30 tops it.",
        fallback: [
          { speaker: "chloe", text: "2h30. Number one where it counts 😎" },
          { speaker: "mike", text: "My effort score is defamatory. Lawyering up." },
        ],
        badge: "Invented a Rule Nobody Understood",
      },
      {
        label: "(change the subject) Anyone watching the 8pm game?",
        tone: "coward",
        effects: { trust: -5, heat: -3, integrity: -3, banter: 0 },
        falloutHint: "It does not go away. It becomes a recurring bit that resurfaces every match day.",
        fallback: [
          { speaker: "doug", text: "No ruling on autofill-gate then. Interesting." },
          { speaker: "ben", text: "The silence is itself a ruling, technically." },
        ],
      },
    ],
  },
  {
    id: "name-changes",
    headline: "MIDNIGHT REBRAND CHAOS",
    kicker: "Three name-change requests land after 11pm",
    intro: [
      { speaker: "shelui", text: "Juan please change my name (Bring back the waistcoat)" },
      { speaker: "fatteh", text: "Can I change mine too? Eze Fati" },
      { speaker: "hannah", text: "And mine's ALL CAPS, makes me the aggressor of the group 😉 pls fix" },
    ],
    choices: [
      {
        label: "Will address username change requests tomorrow 😂",
        tone: "coward",
        effects: { trust: 0, heat: -2, integrity: 2, banter: 2 },
        falloutHint: "Reasonable, adult, mildly disappointing. The requests triple overnight.",
        fallback: [
          { speaker: "fatteh", text: "It's been four minutes, any update" },
          { speaker: "doug", text: "The service in this establishment 🙄" },
        ],
      },
      {
        label: "Done, done and done. Your admin never sleeps 🫡",
        tone: "diplomat",
        effects: { trust: 8, heat: -4, integrity: 0, banter: 5 },
        falloutHint:
          "Heroic 11pm customer service. One name gets typo'd and the typo is instantly beloved.",
        fallback: [
          { speaker: "shelui", text: "🙌🏻🙌🏻🙌🏻" },
          { speaker: "ben", text: "'Eze Fatty'. I assume the typo is load-bearing now." },
        ],
        badge: "Midnight Service Award",
      },
      {
        label: "New policy: £1 rebrand fee per name change. Goes in the pot 💰",
        tone: "chaos",
        effects: { trust: -3, heat: 5, integrity: 4, banter: 9 },
        falloutHint:
          "Outrage, then grudging admiration for the pot growing. Doug attempts to negotiate a bulk rate.",
        fallback: [
          { speaker: "doug", text: "Do you do a loyalty card? 10th rebrand free?" },
          { speaker: "mike", text: "This fee has no basis in the founding documents" },
        ],
        badge: "Grew the Pot",
      },
    ],
  },
  {
    id: "boyfriend-clause",
    headline: "MYSTERY MAN JOINS LATE",
    kicker: "'He's no threat' — famous last words",
    intro: [
      { speaker: "hannah", text: "Can my boyfriend join 😊?! He's called Luke, he's no threat, easy money… for me ;)" },
      { speaker: "luke", text: "Hello and thank you 🙏" },
      { speaker: "doug", text: "A ringer, the day before kickoff. Nothing suspicious there." },
    ],
    choices: [
      {
        label: "Welcome Luke! The more the merrier, the bigger the pot 🤝",
        tone: "diplomat",
        effects: { trust: 5, heat: -3, integrity: -2, banter: 6 },
        falloutHint:
          "Warm welcome. Luke immediately turns out to be suspiciously good, which everyone blames Hannah for.",
        fallback: [
          { speaker: "luke", text: "Feel bad picking France but I want to win 😬" },
          { speaker: "hannah", text: "He said he was no threat!! I've been deceived!!" },
        ],
        badge: "Opened the Borders",
      },
      {
        label: "Admitted — but he's entered as 'MAYBE LUKE', pending review 📎",
        tone: "rulebook",
        effects: { trust: 3, heat: 2, integrity: 6, banter: 8 },
        falloutHint:
          "The provisional status becomes his permanent identity. Nobody ever reviews anything.",
        fallback: [
          { speaker: "luke", text: "Two hours in the group and I already have an asterisk" },
          { speaker: "ben", text: "Schrödinger's entrant. In and not in until the final." },
        ],
        badge: "Pending Review Forever",
      },
      {
        label: "Entries are closed. He can join in 2030 🔒",
        tone: "rulebook",
        effects: { trust: -4, heat: 7, integrity: 8, banter: -5 },
        falloutHint:
          "Hannah invokes the court of public opinion. The group splits between rules and romance.",
        fallback: [
          { speaker: "hannah", text: "You can't pick on the new kid !!" },
          { speaker: "chloe", text: "2030 is a long grudge. I'll help her hold it." },
        ],
      },
    ],
  },
  {
    id: "slop-gate",
    headline: "SLOP-GATE ENGULFS NEWSROOM",
    kicker: "AI team graphic makes three of four women 'identical'",
    intro: [
      { speaker: "chloe", text: "3 out of 4 women look identical… pretty bad prompting" },
      { speaker: "beth", text: "Sexism at its finest" },
      { speaker: "beth", text: "Slop" },
    ],
    choices: [
      {
        label: "Correction issued. Regenerating with better prompts, apologies 🙇",
        tone: "diplomat",
        effects: { trust: 7, heat: -6, integrity: 3, banter: -2 },
        falloutHint:
          "The correction is accepted. The new image is scrutinised pixel by pixel. Someone is now inexplicably a goalkeeper.",
        fallback: [
          { speaker: "chloe", text: "Better. Though I'm a right back now? Questions." },
          { speaker: "beth", text: "Progress. Watching closely 🧐" },
        ],
        badge: "Blamed the Prompt Successfully",
      },
      {
        label: "The artist responsible has been sacked. (I am the artist)",
        tone: "chaos",
        effects: { trust: 1, heat: -2, integrity: 0, banter: 11 },
        falloutHint:
          "The group holds a memorial for the sacked artist. The replacement, hired the same day, is also you.",
        fallback: [
          { speaker: "ben", text: "Press F. The replacement's work looks identical btw." },
          { speaker: "doug", text: "Nepotism at Sweepstakes News. Shocked." },
        ],
        badge: "Sacked Yourself",
      },
      {
        label: "The likeness is within tolerance.",
        tone: "rulebook",
        effects: { trust: -7, heat: 9, integrity: 1, banter: 3 },
        falloutHint:
          "'Within tolerance' becomes the most quoted phrase in the chat, used against the admin forever.",
        fallback: [
          { speaker: "beth", text: "WITHIN TOLERANCE?? 🧐🧐🧐" },
          { speaker: "chloe", text: "Framing this message for the tribunal." },
        ],
      },
    ],
  },
  {
    id: "the-bribe",
    headline: "VOTES FOR SALE",
    kicker: "Member openly solicits bribes on rule vote",
    intro: [
      { speaker: "doug", text: "If the new scoring makes me better off I might vote for it init" },
      { speaker: "doug", text: "How much is that worth to you? I will accept bribes." },
      { speaker: "diego", text: "Do what's right Doug" },
    ],
    choices: [
      {
        label: "Doug's vote is hereby VOID on corruption grounds ⚖️",
        tone: "rulebook",
        effects: { trust: 4, heat: 7, integrity: 8, banter: 4 },
        falloutHint:
          "Doug demands due process for his openly announced corruption. Mike offers to represent him.",
        fallback: [
          { speaker: "doug", text: "Voided for HONESTY? This is why nobody trusts the media." },
          { speaker: "mike", text: "My client was merely price-discovering." },
        ],
        badge: "Anti-Corruption Unit",
      },
      {
        label: "Counter-offer: one (1) commemorative pin badge 🎖️",
        tone: "chaos",
        effects: { trust: 0, heat: -3, integrity: -5, banter: 12 },
        falloutHint:
          "Doug accepts the pin badge with full ceremony. The precedent this sets is deeply concerning.",
        fallback: [
          { speaker: "doug", text: "Deal. But I want a small ceremony." },
          { speaker: "ben", text: "Our electoral system now runs on pin badges. Noted." },
        ],
        badge: "Bribed a Voter (Legally)",
      },
      {
        label: "Let's, um, park the vote for now. Diary's mad this week 🗓️",
        tone: "coward",
        effects: { trust: -6, heat: -4, integrity: -4, banter: 0 },
        falloutHint:
          "The vote enters the same limbo as every other difficult decision. Diego keeps a list.",
        fallback: [
          { speaker: "diego", text: "Adding it to the list of things we never voted on innit" },
          { speaker: "beth", text: "The list is getting long 🧐" },
        ],
      },
    ],
  },
  {
    id: "lawyering-up",
    headline: "PENALTY CLAUSE SHOWDOWN",
    kicker: "'Predict penalties, get points either way?'",
    intro: [
      { speaker: "mike", text: "If you predict a draw do you get the goal difference bonus?" },
      { speaker: "admin", text: "Probably" },
      { speaker: "mike", text: "I'm lawyering up" },
      { speaker: "mike", text: "And penalties in knockouts — points regardless of who wins??" },
    ],
    choices: [
      {
        label: "Publishing the official 14-clause Penalty Jurisprudence 📜",
        tone: "rulebook",
        effects: { trust: 6, heat: -3, integrity: 10, banter: -6 },
        falloutHint:
          "Nobody reads it. Everyone cites it incorrectly within the hour. Ben finds a contradiction in clause 9.",
        fallback: [
          { speaker: "ben", text: "Clause 9 contradicts clause 4. For the appeal." },
          { speaker: "mike", text: "My billable hours are mounting" },
        ],
        badge: "Pinned the Rules, Nobody Read Them",
      },
      {
        label: "Probably",
        tone: "coward",
        effects: { trust: -7, heat: 4, integrity: -8, banter: 8 },
        falloutHint:
          "'Probably' becomes official legal doctrine. Disputes are now settled by asking 'Probably or Definitely?'",
        fallback: [
          { speaker: "mike", text: "The record shows 'probably'. TWICE." },
          { speaker: "doug", text: "Great system. Rock solid." },
        ],
        badge: "The Probably Doctrine",
      },
      {
        label: "Ruling: penalties = draw bonus, winner points separate. FINAL. 🔨",
        tone: "diplomat",
        effects: { trust: 8, heat: -5, integrity: 6, banter: -2 },
        falloutHint:
          "A clean, decisive ruling. Mike is quietly devastated there is nothing to litigate.",
        fallback: [
          { speaker: "mike", text: "…I withdraw my suit. Reluctantly. This time." },
          { speaker: "diego", text: "Look at him governing innit" },
        ],
      },
    ],
  },
  {
    id: "spreadsheet-lag",
    headline: "1AM MELTDOWN AS TABLE FREEZES",
    kicker: "Live scores stuck during the late kickoff",
    intro: [
      { speaker: "fatteh", text: "Table hasn't moved in 40 mins. It's 1am. Am I first or not." },
      { speaker: "fatteh", text: "I NEED to know" },
      { speaker: "doug", text: "Just don't let the result 'manually change' to 2-0 Canada 🤣" },
    ],
    choices: [
      {
        label: "Third-party data issue. Monitoring closely. 🛰️",
        tone: "coward",
        effects: { trust: -3, heat: -4, integrity: -2, banter: 3 },
        falloutHint:
          "Classic deflection. The group starts a conspiracy thread about who the 'data provider' really is.",
        fallback: [
          { speaker: "ben", text: "The data provider is a cron job. I've seen the repo." },
          { speaker: "doug", text: "The data provider is Juan in a wig" },
        ],
        badge: "Blamed Excel Successfully",
      },
      {
        label: "On it. Entering scores by hand. If the baby wakes up, I'm billing you all 👶",
        tone: "diplomat",
        effects: { trust: 9, heat: -6, integrity: 4, banter: 0 },
        falloutHint:
          "Service beyond the call of duty. Fatteh gets his ranking. The baby monitor makes a cameo.",
        fallback: [
          { speaker: "fatteh", text: "FIRST. Normal service resumed. Night all" },
          { speaker: "beth", text: "If he wakes up you're doing every bathtime til the final." },
        ],
        badge: "Midnight Service Award",
      },
      {
        label: "The table updates when it updates. Patience is a virtue 🧘",
        tone: "rulebook",
        effects: { trust: -5, heat: 8, integrity: 2, banter: 4 },
        falloutHint:
          "Telling a man refreshing at 1am to be patient goes exactly how you'd expect.",
        fallback: [
          { speaker: "fatteh", text: "PATIENCE? 212 refreshes and counting" },
          { speaker: "mike", text: "The SLA in this group is a disgrace" },
        ],
      },
    ],
  },
  {
    id: "knockout-bracket",
    headline: "BRACKET BOMBSHELL",
    kicker: "Right teams, wrong bracket = zero points?",
    intro: [
      { speaker: "doug", text: "So if I guess two teams go through but they don't meet… that's 0 points?" },
      { speaker: "doug", text: "seems a bit scuffed" },
      { speaker: "mike", text: "There should be an opt-in to redo knockout predictions" },
    ],
    choices: [
      {
        label: "Let's cross that bridge when we're closer to it 🌉",
        tone: "coward",
        effects: { trust: -6, heat: -3, integrity: -6, banter: 1 },
        falloutHint:
          "The bridge arrives faster than expected. The group bookmarks this exact message to quote back.",
        fallback: [
          { speaker: "doug", text: "We are AT the bridge. It is ON FIRE." },
          { speaker: "ben", text: "Bookmarking this message for two weeks from now." },
        ],
      },
      {
        label: "New ruling: right team, wrong bracket = half points. Recalculating now 🔄",
        tone: "diplomat",
        effects: { trust: 7, heat: 5, integrity: -4, banter: 3 },
        falloutHint:
          "Three people go up, two go down, one is mysteriously unchanged and suspicious about it.",
        fallback: [
          { speaker: "diego", text: "My position didn't change at all. Rigged innit" },
          { speaker: "shelui", text: "I went UP? Love the bracket economy 🤩" },
        ],
        badge: "Started a Recount",
      },
      {
        label: "Zero points. The bracket is sacred. This is the way. 🛡️",
        tone: "rulebook",
        effects: { trust: 2, heat: 7, integrity: 10, banter: -4 },
        falloutHint:
          "Half the group loses interest in their doomed brackets. Doug declares the tournament 'basically over'.",
        fallback: [
          { speaker: "doug", text: "So it's basically over after the groups then" },
          { speaker: "humfrey", text: "Wait what happened to the brackets" },
        ],
      },
    ],
  },
  {
    id: "voodoo-incident",
    headline: "VOODOO STRIKES LEADER",
    kicker: "'Too early for my voodoo?' — jinx wipes a perfect score",
    intro: [
      { speaker: "doug", text: "Tian has won it already. I suspect foul play" },
      { speaker: "admin", text: "Jinxed it Doug" },
      { speaker: "doug", text: "Too early for my voodoo? He was running away with it." },
    ],
    choices: [
      {
        label: "New rule: all voodoo must be declared in the official Jinx Register 📕",
        tone: "chaos",
        effects: { trust: 2, heat: 2, integrity: -3, banter: 12 },
        falloutHint:
          "The Jinx Register becomes the best maintained document in the sweepstake. Undeclared jinxes now carry penalties nobody agreed to.",
        fallback: [
          { speaker: "doug", text: "Declaring a level-2 jinx on Friday's leader" },
          { speaker: "mike", text: "Is retroactive voodoo covered? For my appeal." },
        ],
        badge: "Regulated the Occult",
      },
      {
        label: "Jinxing is beneath this competition. Points are earned, not cursed. 🚫",
        tone: "rulebook",
        effects: { trust: 3, heat: 3, integrity: 4, banter: -6 },
        falloutHint:
          "The group nods solemnly and keeps jinxing in a side chat that everyone knows about.",
        fallback: [
          { speaker: "doug", text: "Understood. (moves voodoo underground)" },
          { speaker: "shelui", text: "The side chat is called Jinx HQ and I was added without consent" },
        ],
      },
      {
        label: "Doug save the voodoo for the knockouts, we need it vs France 🇫🇷",
        tone: "diplomat",
        effects: { trust: 1, heat: -4, integrity: 0, banter: 7 },
        falloutHint:
          "Admin-sanctioned voodoo scheduling. Doug agrees to a ceasefire with terms nobody fully understands.",
        fallback: [
          { speaker: "doug", text: "Fine. But my jinxes are banked and accruing interest." },
          { speaker: "humfrey", text: "Is voodoo why we lost in 2022?" },
        ],
        badge: "Voodoo Ceasefire Broker",
      },
    ],
  },
  {
    id: "prize-structure",
    headline: "POT WARS: 70-20-10 UNDER FIRE",
    kicker: "Winner-takes-all faction vs last-place-prize movement",
    intro: [
      { speaker: "chloe", text: "We need a last place prize. Bottom of the table takes dedication" },
      { speaker: "mike", text: "Wait do we even pay in? Or is this for glory" },
      { speaker: "doug", text: "I'm waiting to see if I'm winning before I pay" },
    ],
    choices: [
      {
        label: "70-20-10 as the founders intended. Plus a wooden spoon for last 🥄",
        tone: "diplomat",
        effects: { trust: 7, heat: -4, integrity: 5, banter: 5 },
        falloutHint:
          "The wooden spoon is instantly the most coveted prize. The relegation zone begins campaigning downward.",
        fallback: [
          { speaker: "chloe", text: "The spoon is MINE. Nobody tanks harder than me." },
          { speaker: "shelui", text: "Is the spoon transferable if I climb out of last 😅" },
        ],
        badge: "Wooden Spoon Commissioner",
      },
      {
        label: "Winner takes all. Glory or nothing. 🏆",
        tone: "chaos",
        effects: { trust: -4, heat: 9, integrity: 3, banter: 6 },
        falloutHint:
          "The mid-table immediately loses all reason to live. Alliances and sabotage rumours begin.",
        fallback: [
          { speaker: "doug", text: "Winner takes all but the admin holds the money. What could go wrong." },
          { speaker: "diego", text: "This benefits exactly one person innit" },
        ],
      },
      {
        label: "Putting it to a poll 🗳️",
        tone: "coward",
        effects: { trust: -2, heat: 4, integrity: -2, banter: 8 },
        falloutHint:
          "The poll spawns three counter-polls, one of which is just attacking the admin. Democracy at work.",
        fallback: [
          { speaker: "mike", text: "POLL: should we have a poll about the polls?" },
          { speaker: "beth", text: "This is why we can't have nice things 🧐" },
        ],
        badge: "Death by Poll",
      },
    ],
  },
  {
    id: "source-code",
    headline: "HACKING FEARS AT SWEEPSTAKES HQ",
    kicker: "Member requests source code — 'planting the hacking seed'",
    intro: [
      { speaker: "ben", text: "Can you share the code?" },
      { speaker: "admin", text: "for admin rights?" },
      { speaker: "ben", text: "No, the source code" },
      { speaker: "doug", text: "so it begins" },
    ],
    choices: [
      {
        label: "Sure — repo's public. Sunlight is the best disinfectant ☀️",
        tone: "diplomat",
        effects: { trust: 9, heat: -3, integrity: 3, banter: 2 },
        falloutHint:
          "Ben files three bug reports within the hour, one of which affects the scores. Transparency has a price.",
        fallback: [
          { speaker: "ben", text: "PR opened: 'fix: bonus applied twice'. You're welcome. Or sorry." },
          { speaker: "doug", text: "TOLD YOU THE CHEATS WERE INSTALLED" },
        ],
        badge: "Went Open Source",
      },
      {
        label: "The code is proprietary to Sweepstakes News Ltd. 💼",
        tone: "rulebook",
        effects: { trust: -5, heat: 5, integrity: 4, banter: 5 },
        falloutHint:
          "A company that does not exist now has trade secrets. Mike asks for the incorporation documents.",
        fallback: [
          { speaker: "mike", text: "Companies House has no record of Sweepstakes News Ltd. Curious." },
          { speaker: "ben", text: "I'll reverse engineer it from the network tab then." },
        ],
      },
      {
        label: "Sharing it now. Do ignore the file called cheats.ts (it's empty) 📂",
        tone: "chaos",
        effects: { trust: -2, heat: 6, integrity: -2, banter: 12 },
        falloutHint:
          "Doug finds cheats.ts within 90 seconds and treats the empty file as a cover-up rather than a joke.",
        fallback: [
          { speaker: "doug", text: "AN EMPTY FILE IS WHAT YOU'D COMMIT AFTER DELETING THE CHEATS" },
          { speaker: "ben", text: "git log says added yesterday. Premeditated." },
        ],
        badge: "Premeditated Banter",
      },
    ],
  },
  {
    id: "pay-up-chase",
    headline: "£10 SCANDAL: WHERE'S THE MONEY?",
    kicker: "Tournament half done, pot still theoretical",
    intro: [
      { speaker: "fatteh", text: "Does the money go to you Juan?" },
      { speaker: "mike", text: "Send it to me mate" },
      { speaker: "doug", text: "I'm waiting to see if I'm winning first" },
    ],
    choices: [
      {
        label: "Posting the paid/unpaid list. You know who you are. 📋",
        tone: "rulebook",
        effects: { trust: 4, heat: 7, integrity: 7, banter: 4 },
        falloutHint:
          "The list works, at a cost. Two people claim they paid 'in spirit'. One paid twice and wants interest.",
        fallback: [
          { speaker: "humfrey", text: "I definitely paid. In 2018." },
          { speaker: "ben", text: "I paid twice. Expecting this reflected in my points. Half joking." },
        ],
        badge: "Debt Collector",
      },
      {
        label: "All settled, don't worry about the pot 👍 (quietly covers it himself)",
        tone: "coward",
        effects: { trust: 3, heat: -6, integrity: -5, banter: -2 },
        falloutHint:
          "Serene surface, invisible cost. Bethany notices the joint account and it becomes a household matter.",
        fallback: [
          { speaker: "beth", text: "Why does our account say 'sweepstakes float x4' 🧐" },
          { speaker: "doug", text: "Suspiciously quiet on the money front. All paid then? Great." },
        ],
      },
      {
        label: "No pay, no prize. Points count, money doesn't. 💷",
        tone: "diplomat",
        effects: { trust: 6, heat: 2, integrity: 6, banter: 0 },
        falloutHint:
          "Clean incentive design. Doug, mid-table, announces he'll pay 'once the picture is clearer'.",
        fallback: [
          { speaker: "doug", text: "I'll pay when I'm mathematically alive. It's called prudence." },
          { speaker: "mike", text: "Ruling accepted. Invoice for reviewing it is in the post." },
        ],
      },
    ],
  },
  {
    id: "relegation-pride",
    headline: "RELEGATION ZONE DEMANDS RIGHTS",
    kicker: "Bottom of table organises",
    intro: [
      { speaker: "chloe", text: "Being last takes dedication and fortitude. Where's OUR prize" },
      { speaker: "shelui", text: "Everyone loves an underdog!" },
      { speaker: "doug", text: "They are like ants down there" },
    ],
    choices: [
      {
        label: "Launching the official Relegation Battle table, with commentary 🎙️",
        tone: "diplomat",
        effects: { trust: 5, heat: -4, integrity: 0, banter: 10 },
        falloutHint:
          "The relegation table becomes more followed than the real one. The mid-table complains about being ignored.",
        fallback: [
          { speaker: "chloe", text: "Finally, content for MY demographic." },
          { speaker: "mike", text: "Nobody covers the mid-table grind. Media bias." },
        ],
        badge: "Minister of the Underdogs",
      },
      {
        label: "The table has one direction. Up. Climb. 🧗",
        tone: "rulebook",
        effects: { trust: -3, heat: 5, integrity: 3, banter: 2 },
        falloutHint:
          "Motivational admin voice lands badly with people who are down there partly because of his autofill feature.",
        fallback: [
          { speaker: "chloe", text: "I didn't spend 2h30 predicting to be motivational-postered." },
          { speaker: "shelui", text: "Months to go! (copes)" },
        ],
      },
      {
        label: "Good news: the algorithm now favours underdogs 😉 (nothing changed)",
        tone: "chaos",
        effects: { trust: -7, heat: 6, integrity: -8, banter: 9 },
        falloutHint:
          "A placebo patch note. The bottom three all gain points that week by coincidence and the myth becomes unkillable.",
        fallback: [
          { speaker: "shelui", text: "IT'S WORKING I can feel the algorithm 🤩" },
          { speaker: "ben", text: "There is no algorithm. I've read the source. There is no algorithm???" },
        ],
        badge: "Placebo Patch Notes",
      },
    ],
  },
  {
    id: "deleted-message",
    headline: "THE DELETED MESSAGE MYSTERY",
    kicker: "'You deleted this message' — group demands answers",
    intro: [
      { speaker: "admin", text: "You deleted this message" },
      { speaker: "doug", text: "What did he delete" },
      { speaker: "mike", text: "Deleting evidence now are we" },
      { speaker: "beth", text: "I saw it. Saying nothing. Yet. 🧐" },
    ],
    choices: [
      {
        label: "It was a typo of no consequence. No further comment.",
        tone: "coward",
        effects: { trust: -5, heat: 5, integrity: 0, banter: 6 },
        falloutHint:
          "Nothing fuels a group chat like a refused comment. Theories range from leaked scores to a message meant for another chat.",
        fallback: [
          { speaker: "doug", text: "No consequence?? Then repost it. Go on." },
          { speaker: "diego", text: "The cover-up is always worse than the typo innit" },
        ],
      },
      {
        label: "Fine — it was tomorrow's standings, sent early. Here it is again 📊",
        tone: "diplomat",
        effects: { trust: 7, heat: 3, integrity: -3, banter: 5 },
        falloutHint:
          "Honesty, but now everyone has seen provisional standings and two people are already contesting them.",
        fallback: [
          { speaker: "fatteh", text: "PROVISIONAL?? Am I provisionally first or actually first" },
          { speaker: "mike", text: "Early disclosure. Adding to the case file." },
        ],
        badge: "Leaked the Back Page",
      },
      {
        label: "The toddler sent it. He cannot be cross-examined. 👶",
        tone: "chaos",
        effects: { trust: -3, heat: -3, integrity: -2, banter: 11 },
        falloutHint:
          "The toddler defence is legally airtight and everyone knows it. The toddler gains folk-hero status.",
        fallback: [
          { speaker: "beth", text: "Leave our son out of your web of lies 🧐" },
          { speaker: "doug", text: "The kid's more trustworthy than the admin tbf" },
        ],
        badge: "The Toddler Defence",
      },
    ],
  },
  {
    id: "wifi-outage",
    headline: "ADMIN MISSING DURING ENGLAND MATCH",
    kicker: "Leaderboard down, admin 'on a bike ride'",
    intro: [
      { speaker: "fatteh", text: "Table's down. England 1-0 up. WHERE is the admin" },
      { speaker: "mike", text: "He's cycling. CYCLING. During a live fixture." },
      { speaker: "doug", text: "Probably updating the cheats from a layby in the South Downs" },
    ],
    choices: [
      {
        label: "Fixed from the top of Ditchling Beacon. One-handed. You're welcome 🚴",
        tone: "diplomat",
        effects: { trust: 8, heat: -5, integrity: 3, banter: 6 },
        falloutHint:
          "Heroics. The Strava screenshot gets more reactions than the England goal.",
        fallback: [
          { speaker: "mike", text: "Fixed from a hilltop. Lawsuit paused. Grudging respect." },
          { speaker: "shelui", text: "The dedication 🤩 (I missed the goal too, bathtime)" },
        ],
        badge: "Fixed It From a Hilltop",
      },
      {
        label: "The site has scheduled maintenance windows. Check the docs.",
        tone: "coward",
        effects: { trust: -6, heat: 4, integrity: -4, banter: 3 },
        falloutHint:
          "Ben greps the repo for 'maintenance'. Zero results. He posts the search output.",
        fallback: [
          { speaker: "ben", text: "grep -ri 'maintenance' → 0 results. Interesting." },
          { speaker: "doug", text: "Maintenance. During England. Sure. SURE." },
        ],
      },
      {
        label: "The mountains were here before the leaderboard. Back in 2h 🏔️",
        tone: "chaos",
        effects: { trust: -8, heat: 8, integrity: 0, banter: 8 },
        falloutHint:
          "Total dereliction of duty, weirdly respected by some. The chat runs feral for two hours.",
        fallback: [
          { speaker: "diego", text: "Full Colombian climber mode innit. Respect and also refund" },
          { speaker: "fatteh", text: "94 minutes. 212 refreshes." },
        ],
        badge: "The Mountains Called",
      },
    ],
  },
  {
    id: "toddler-incident",
    headline: "TODDLER BREACHES ADMIN CONSOLE",
    kicker: "Entry mysteriously renamed 'bbbbfffff 🦖'",
    intro: [
      { speaker: "humfrey", text: "Why is my team called bbbbfffff 🦖" },
      { speaker: "doug", text: "Security at this organisation is a joke" },
      { speaker: "beth", text: "You left him with your phone AGAIN 🧐" },
    ],
    choices: [
      {
        label: "Restored. Passcode enabled. Formal apology to Humfrey. 🙇",
        tone: "diplomat",
        effects: { trust: 6, heat: -4, integrity: 5, banter: -3 },
        falloutHint: "Professional. But part of the group is sad — they liked bbbbfffff 🦖.",
        fallback: [
          { speaker: "shelui", text: "RIP bbbbfffff 🦖 gone too soon" },
          { speaker: "humfrey", text: "Thanks. The dinosaur was growing on me tbh" },
        ],
      },
      {
        label: "The rename stands until Humfrey wins a match day. Incentives. 🦖",
        tone: "chaos",
        effects: { trust: -3, heat: 4, integrity: -4, banter: 12 },
        falloutHint:
          "Humfrey, motivated by dinosaur shame, has his best match day of the tournament. The system works?",
        fallback: [
          { speaker: "humfrey", text: "Right. Watch me cook. First time since 2024." },
          { speaker: "doug", text: "Punishment renames. Finally, proper governance." },
        ],
        badge: "Dinosaur Justice",
      },
      {
        label: "Announcement: the toddler is now Deputy Administrator 🍼",
        tone: "chaos",
        effects: { trust: 0, heat: -2, integrity: -3, banter: 10 },
        falloutHint:
          "The Deputy's approval rating instantly exceeds the admin's. Members address their appeals to the toddler.",
        fallback: [
          { speaker: "mike", text: "Escalating my penalty appeal to the Deputy" },
          { speaker: "beth", text: "He rules by pointing. Honestly? More transparent." },
        ],
        badge: "Deputy Administrator Appointed",
      },
    ],
  },
  {
    id: "germany-farmers",
    headline: "'PLAYING AGAINST FARMERS'",
    kicker: "Curaçao slander reaches the German desk",
    intro: [
      { speaker: "doug", text: "Poor from Germany. Playing against farmers" },
      { speaker: "admin", text: "Curaçao's farming industry is negligible" },
      { speaker: "ben", text: "As the group's German I'd like this struck from the record" },
    ],
    choices: [
      {
        label: "Official correction on Curaçao's agricultural GDP, with sources 📚",
        tone: "rulebook",
        effects: { trust: 3, heat: -4, integrity: 4, banter: 8 },
        falloutHint:
          "An aggressively researched fact-check of a joke. The group loves the commitment to the bit.",
        fallback: [
          { speaker: "ben", text: "Peer-reviewed banter. This is why I asked for the source code." },
          { speaker: "doug", text: "Fine. Playing against FISHERMEN then." },
        ],
        badge: "Fact-Checked the Banter",
      },
      {
        label: "Doug is fined 1 point for agricultural slander ⚖️",
        tone: "chaos",
        effects: { trust: -4, heat: 6, integrity: -5, banter: 10 },
        falloutHint:
          "The first points deduction in sweepstakes history. Constitutional crisis, but a hilarious one.",
        fallback: [
          { speaker: "doug", text: "A DEDUCTION? Get my lawyer. Mike. MIKE." },
          { speaker: "mike", text: "On it. This is the case I trained for." },
        ],
        badge: "First Points Deduction in History",
      },
      {
        label: "Agriculture is beyond the admin's remit. Carry on.",
        tone: "coward",
        effects: { trust: -2, heat: 2, integrity: 0, banter: 3 },
        falloutHint:
          "The farmers discourse rages for another 40 messages without adult supervision.",
        fallback: [
          { speaker: "doug", text: "No comment on Big Farming. Noted." },
          { speaker: "humfrey", text: "My uncle's a farmer actually" },
        ],
      },
    ],
  },
  {
    id: "excel-bug",
    headline: "PENALTY BONUS BUG EXPOSED",
    kicker: "Formula rewards being wrong",
    intro: [
      { speaker: "ben", text: "You get 5pts for one team's goals even if the result is wrong. I predict 4:1, it ends 0:1… points." },
      { speaker: "diego", text: "I got the result completely wrong and STILL scored 🙃" },
      { speaker: "doug", text: "The formula pays out for being wrong. Incredible product." },
    ],
    choices: [
      {
        label: "Bug confirmed. Fixing NOW and recalculating everything. Brace. 🔧",
        tone: "rulebook",
        effects: { trust: 8, heat: 7, integrity: 12, banter: -5 },
        falloutHint:
          "Integrity restored at the cost of three simultaneous meltdowns from people losing points mid-dinner.",
        fallback: [
          { speaker: "diego", text: "You can't take points I've emotionally spent innit" },
          { speaker: "fatteh", text: "I dropped TWO places while eating dinner." },
        ],
        badge: "Recalculated Under Fire",
      },
      {
        label: "Past points stand. Fix applies from tomorrow. Fairest for all. 🤝",
        tone: "diplomat",
        effects: { trust: 5, heat: -5, integrity: -4, banter: 2 },
        falloutHint:
          "The classic compromise. Everyone is 80% satisfied, which in this group counts as a landslide.",
        fallback: [
          { speaker: "mike", text: "Grandfathering an exploit. Bold. I approve, coincidentally." },
          { speaker: "ben", text: "The bug is now a feature with a retirement date. Documented." },
        ],
      },
      {
        label: "This is an Excel issue. Excel has been notified. 📧",
        tone: "coward",
        effects: { trust: -4, heat: -2, integrity: -6, banter: 9 },
        falloutHint:
          "The site is not built in Excel and at least two people know it. Excel's reputation takes the hit anyway.",
        fallback: [
          { speaker: "ben", text: "It's a Next.js app. Excel is innocent." },
          { speaker: "doug", text: "Blame the spreadsheet. It has a family." },
        ],
        badge: "Blamed Excel Successfully",
      },
    ],
  },
  {
    id: "rival-leaderboard",
    headline: "BREAKAWAY LEAGUE THREATENED",
    kicker: "A rival leaderboard 'with better governance'",
    intro: [
      { speaker: "mike", text: "Announcement: I've built a spreadsheet with our REAL standings under fair scoring" },
      { speaker: "diego", text: "The people's table innit" },
      { speaker: "doug", text: "I've seen it. It's beautiful. I'm second." },
    ],
    choices: [
      {
        label: "The rival table is an unsanctioned competition. BANNED. 🚫",
        tone: "rulebook",
        effects: { trust: -6, heat: 10, integrity: 6, banter: 4 },
        falloutHint: "Banning it makes it twice as popular. It gains a logo within the hour.",
        fallback: [
          { speaker: "mike", text: "You can't ban a Google Sheet. UEFA-tier overreaction." },
          { speaker: "diego", text: "First they ignore you, then they ban your spreadsheet innit" },
        ],
        badge: "Triggered a Rival Leaderboard",
      },
      {
        label: "Love it — linking the People's Table on the official site 🤝",
        tone: "diplomat",
        effects: { trust: 8, heat: -8, integrity: -2, banter: 6 },
        falloutHint:
          "Absorbing the opposition. The rival maintainer now has to do actual work, and enthusiasm dies in days.",
        fallback: [
          { speaker: "mike", text: "Wait, now I have to update it every match?? Retired." },
          { speaker: "ben", text: "Textbook. Embrace, extend, extinguish." },
        ],
        badge: "Absorbed the Opposition",
      },
      {
        label: "Cute spreadsheet. Shame about the formula error in row 2. 👀",
        tone: "chaos",
        effects: { trust: -3, heat: 6, integrity: 2, banter: 10 },
        falloutHint:
          "There is indeed an error in row 2. The people's revolution collapses into infighting about VLOOKUP.",
        fallback: [
          { speaker: "doug", text: "Hang on. Why am I 4th in the fair table now. MIKE." },
          { speaker: "mike", text: "It's a known issue!! The methodology is sound!!" },
        ],
        badge: "Counter-Intelligence Operation",
      },
    ],
  },
  {
    id: "graph-request",
    headline: "GIVE US GRAPHS, DEMAND FANS",
    kicker: "'Fear my inexorable rise up the rankings'",
    intro: [
      { speaker: "mike", text: "Can you provide a graph of positions over time" },
      { speaker: "mike", text: "I want people to fear my inexorable rise" },
      { speaker: "doug", text: "Feature request: let me change my guesses please" },
    ],
    choices: [
      {
        label: "Graph shipped ✅ (it shows Mike going down)",
        tone: "diplomat",
        effects: { trust: 6, heat: 2, integrity: 2, banter: 10 },
        falloutHint:
          "The graph is beautiful and devastating. Mike requests a recall on data-quality grounds.",
        fallback: [
          { speaker: "mike", text: "The y-axis is biased against me." },
          { speaker: "beth", text: "The data has spoken 🧐" },
        ],
        badge: "Quality Analytics Award",
      },
      {
        label: "Feature requests go through the official roadmap 🛣️",
        tone: "coward",
        effects: { trust: -4, heat: 2, integrity: -2, banter: 5 },
        falloutHint:
          "Someone asks to see the roadmap. A roadmap must now be invented retroactively, at speed.",
        fallback: [
          { speaker: "ben", text: "Link to the roadmap please. For my records." },
          { speaker: "doug", text: "The roadmap is wherever the admin's bike goes" },
        ],
      },
      {
        label: "Graphs unlock when the chat votes me 'visionary' 😌",
        tone: "chaos",
        effects: { trust: -2, heat: 4, integrity: 0, banter: 9 },
        falloutHint:
          "The group must now publicly flatter the admin for features. Democracy has never been cheaper.",
        fallback: [
          { speaker: "mike", text: "Fine. 'Visionary.' Under protest, for graph purposes only." },
          { speaker: "diego", text: "Extorting compliments for features. Cartel behaviour innit" },
        ],
        badge: "Extorted a Compliment",
      },
    ],
  },
];
