export interface Sponsor {
  name: string;
  kind: "organization" | "individual";
  url?: string;
  logo?: string;
  tier?: string;
}

export const sponsors: Sponsor[] = [
  {
    name: "Cumoratek AV Solutions",
    kind: "organization",
    url: "https://cumoratek.com/",
    logo: "https://avatars.githubusercontent.com/u/137531034?v=4",
    tier: "Production Company",
  },
  {
    name: "Sean Curtis",
    kind: "individual",
  },
];
