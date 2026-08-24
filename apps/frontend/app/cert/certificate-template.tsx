import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import { appName } from "@/lib/branding"

export interface CertificateData {
  participantName: string
  teamName: string
  overallRank: number | null
  totalTeams: number
  taskPlacements: {
    taskName: string
    rank: number | null
    totalTeams: number
  }[]
  tier: "gold" | "silver" | "bronze" | "standard"
  certificateCode: string
}

const TIER_COLORS = {
  gold: "#C5A44E",
  silver: "#8D9AAB",
  bronze: "#CD7F32",
  standard: "#4A7A9B",
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: "SpaceGrotesk",
    position: "relative",
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  outerBorder: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    border: "1.5px solid #C5A44E",
  },
  innerBorder: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    border: "0.5px solid #C5A44E",
    opacity: 0.4,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 30,
    paddingBottom: 30,
    paddingLeft: 40,
    paddingRight: 40,
  },
  subtitle: {
    fontSize: 9,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#FFFFFF",
    opacity: 0.6,
    marginBottom: 20,
  },
  heading: {
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#FFFFFF",
    marginBottom: 8,
    fontWeight: "bold",
  },
  certifiesText: {
    fontSize: 9,
    color: "#99AABB",
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 9,
    color: "#99AABB",
    marginBottom: 4,
  },
  competitionName: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "bold",
    marginBottom: 14,
  },
  name: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: "bold",
    marginBottom: 4,
  },
  teamName: {
    fontSize: 12,
    color: "#AABBCC",
    marginBottom: 16,
  },
  badgeContainer: {
    marginBottom: 16,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 18,
    borderRadius: 3,
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  taskRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
    width: "70%",
  },
  taskCard: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    backgroundColor: "#F5F5F5",
    borderRadius: 4,
  },
  taskLabel: {
    fontSize: 7,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  taskRank: {
    fontSize: 16,
    color: "#111F38",
    fontWeight: "bold",
  },
  logoText: {
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "bold",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
})

export function CertificateDocument({ data }: { data: CertificateData }) {
  const tierColor = TIER_COLORS[data.tier]
  const isAchievement =
    data.tier === "gold" || data.tier === "silver" || data.tier === "bronze"
  const heading = isAchievement
    ? "Certificate of Achievement"
    : "Certificate of Participation"

  const basePath = process.cwd() + "/public/"

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* react-pdf's Image is not an HTML image and has no alt prop. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={basePath + "certificate-bg.png"} style={styles.backgroundImage} fixed />
        <View style={styles.outerBorder} fixed />
        <View style={styles.innerBorder} fixed />

        {/* Placement ribbon for top 3 - rendered when ribbon images are provided */}

        <View style={styles.content}>
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.logoText}>{appName}</Text>
          </View>

          <Text style={styles.heading}>{heading}</Text>

          <View
            style={{
              width: 50,
              height: 1,
              backgroundColor: data.tier === "standard" ? "#C5A44E" : tierColor,
              marginBottom: 10,
            }}
          />

          <Text style={styles.certifiesText}>This is to certify that</Text>
          <Text style={styles.name}>{data.participantName}</Text>
          <Text style={styles.teamName}>Team {data.teamName}</Text>
          <Text style={styles.descriptionText}>
            successfully competed in
          </Text>
          <Text style={styles.competitionName}>
            {appName}
          </Text>

          {data.overallRank !== null && (
            <View style={{ alignItems: "center", marginBottom: 16, gap: 6 }}>
              <Text
                style={[styles.badge, { backgroundColor: tierColor }]}
              >
                {ordinal(data.overallRank)} Place Overall
              </Text>
            </View>
          )}

          <View style={styles.taskRow}>
            {data.taskPlacements.map((tp) => (
              <View key={tp.taskName} style={styles.taskCard}>
                <Text style={styles.taskLabel}>{tp.taskName}</Text>
                <Text style={styles.taskRank}>
                  {tp.rank !== null ? ordinal(tp.rank) : "\u2014"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Certificate verification code */}
        <Text
          style={{
            position: "absolute",
            bottom: 28,
            left: 28,
            fontSize: 5,
            color: "#556677",
          }}
          fixed
        >
          {data.certificateCode}
        </Text>
      </Page>
    </Document>
  )
}
