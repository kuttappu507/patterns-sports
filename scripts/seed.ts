// PS-AMS demo data seeder — populates a realistic academy dataset
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

function dob(year: number, month: number, day: number) {
  return new Date(year, month - 1, day)
}
function monthsAgo(n: number) {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - n, 12)
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

async function main() {
  console.log("Seeding PS-AMS demo data…")

  const existing = await db.student.count()
  if (existing > 0) {
    console.log(`Database already has ${existing} students — skipping seed.`)
    return
  }

  // Committee
  const committee = [
    { fullName: "Suresh Kumar Pillai", role: "President", phone: "+91 94470 12345", responsibilities: "Overall academy governance and external liaison", displayOrder: 0 },
    { fullName: "Anitha Raghavan", role: "General Secretary", phone: "+91 98470 22334", responsibilities: "Day-to-day administration, tournaments and records", displayOrder: 1 },
    { fullName: "Rajesh Menon", role: "Treasurer", phone: "+91 99461 55667", responsibilities: "Fee oversight, budgets and annual audit", displayOrder: 2 },
    { fullName: "Deepa Krishnan", role: "Executive Member", phone: "+91 94950 33445", responsibilities: "Coaching coordination and camp logistics", displayOrder: 3 },
    { fullName: "Vikram Shetty", role: "Executive Member", phone: "+91 96330 77889", responsibilities: "Equipment, ground maintenance and transport", displayOrder: 4 },
  ]
  for (const c of committee) await db.committeeMember.create({ data: c })

  // Students — spread across categories with varied registration dates
  const students = [
    { fullName: "Aravind R Menon", dateOfBirth: dob(2011, 5, 14), parentName: "Ramesh Menon", mobile: "9847012001", emergencyContact: "9847012002", address: "Kaloor, Ernakulam", schoolName: "Bhavans Vidya Mandir", classGrade: "9", division: "A", bloodGroup: "O+", heightCm: 168, weightKg: 52, standingReachCm: 216, spikeReachCm: 248, jumpReachCm: 270, primarySport: "Volleyball", playingPosition: "Attacker / Spiker", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, registeredAgo: 8 },
    { fullName: "Nandhana Suresh", dateOfBirth: dob(2013, 9, 2), parentName: "Suresh Babu", mobile: "9847012003", address: "Kadavanthra, Ernakulam", schoolName: "Rajagiri Christu Jayanthi", classGrade: "7", division: "B", bloodGroup: "A+", heightCm: 155, weightKg: 41, standingReachCm: 198, spikeReachCm: 228, jumpReachCm: 252, primarySport: "Volleyball", playingPosition: "Setter", ageCategory: "Sub-Junior", trainingBatch: "Evening", monthlyFee: 500, registeredAgo: 8 },
    { fullName: "Muhammed Sinan", dateOfBirth: dob(2009, 12, 21), parentName: "Abdul Nazar", mobile: "9847012004", emergencyContact: "9946012004", address: "Aluva", schoolName: "Chinmaya Vidyalaya", classGrade: "11", division: "C", bloodGroup: "B+", heightCm: 178, weightKg: 63, standingReachCm: 228, spikeReachCm: 262, jumpReachCm: 285, primarySport: "Volleyball", playingPosition: "Blocker", ageCategory: "Youth", trainingBatch: "Morning", monthlyFee: 600, registeredAgo: 7 },
    { fullName: "Diya Krishnan", dateOfBirth: dob(2017, 3, 18), parentName: "Krishnan Unni", mobile: "9847012005", address: "Tripunithura", schoolName: "Bhavans Vidya Mandir", classGrade: "3", division: "A", bloodGroup: "AB+", heightCm: 124, weightKg: 23, primarySport: "Badminton", playingPosition: "Singles", ageCategory: "Mini", trainingBatch: "Morning", monthlyFee: 400, registeredAgo: 6 },
    { fullName: "Joel Thomas", dateOfBirth: dob(2006, 7, 8), parentName: "Thomas Varghese", mobile: "9847012006", address: "Edappally", schoolName: "St. Alberts HSS", classGrade: "12", division: "B", bloodGroup: "O-", heightCm: 185, weightKg: 71, standingReachCm: 238, spikeReachCm: 272, jumpReachCm: 296, primarySport: "Volleyball", playingPosition: "Universal", ageCategory: "Senior", trainingBatch: "Evening", monthlyFee: 700, registeredAgo: 6 },
    { fullName: "Sneha Prakash", dateOfBirth: dob(2012, 1, 25), parentName: "Prakash Nair", mobile: "9847012007", address: "Vyttila", schoolName: "Nirmala Public School", classGrade: "8", division: "A", bloodGroup: "B-", heightCm: 158, weightKg: 44, standingReachCm: 202, spikeReachCm: 234, primarySport: "Volleyball", playingPosition: "Libero", ageCategory: "Sub-Junior", trainingBatch: "Morning", monthlyFee: 500, registeredAgo: 5 },
    { fullName: "Adithya Raj", dateOfBirth: dob(2010, 10, 11), parentName: "Rajesh Kumar", mobile: "9847012008", address: "Palarivattom", schoolName: "Bhavans Vidya Mandir", classGrade: "10", division: "B", bloodGroup: "A-", heightCm: 172, weightKg: 58, standingReachCm: 222, spikeReachCm: 256, jumpReachCm: 278, primarySport: "Basketball", playingPosition: "Power Forward", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, registeredAgo: 5 },
    { fullName: "Fathima Rasheed", dateOfBirth: dob(2014, 6, 30), parentName: "Rasheed KP", mobile: "9847012009", emergencyContact: "9744012009", address: "Mattancherry", schoolName: "Crescent Public School", classGrade: "6", division: "C", bloodGroup: "O+", heightCm: 147, weightKg: 36, primarySport: "Athletics", playingPosition: "Sprint", ageCategory: "Sub-Junior", trainingBatch: "Morning", monthlyFee: 450, registeredAgo: 4 },
    { fullName: "Karthik S Nair", dateOfBirth: dob(2008, 2, 9), parentName: "Santhosh Nair", mobile: "9847012010", address: "Kakkanad", schoolName: "Rajagiri Christu Jayanthi", classGrade: "12", division: "A", bloodGroup: "AB-", heightCm: 181, weightKg: 66, standingReachCm: 232, spikeReachCm: 266, jumpReachCm: 288, primarySport: "Volleyball", playingPosition: "Setter", ageCategory: "Youth", trainingBatch: "Evening", monthlyFee: 600, registeredAgo: 3 },
    { fullName: "Lakshmi Warrier", dateOfBirth: dob(2016, 11, 5), parentName: "Ajith Warrier", mobile: "9847012011", address: "Fort Kochi", schoolName: "Sacred Heart CMI", classGrade: "4", division: "B", bloodGroup: "A+", heightCm: 132, weightKg: 27, primarySport: "Badminton", playingPosition: "Doubles", ageCategory: "Mini", trainingBatch: "Morning", monthlyFee: 400, registeredAgo: 2 },
    { fullName: "Reuben Jacob", dateOfBirth: dob(2007, 4, 27), parentName: "Jacob Cherian", mobile: "9847012012", address: "Thrikkakara", schoolName: "Bhavans Vidya Mandir", classGrade: "11", division: "B", bloodGroup: "B+", heightCm: 176, weightKg: 61, standingReachCm: 226, spikeReachCm: 259, primarySport: "Volleyball", playingPosition: "Attacker / Spiker", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, registeredAgo: 2 },
    { fullName: "Ananya Sasi", dateOfBirth: dob(2011, 8, 16), parentName: "Sasi Kumar", mobile: "9847012013", address: "Maradu", schoolName: "Nirmala Public School", classGrade: "9", division: "C", bloodGroup: "O+", heightCm: 162, weightKg: 47, standingReachCm: 208, spikeReachCm: 240, jumpReachCm: 262, primarySport: "Volleyball", playingPosition: "Blocker", ageCategory: "Junior", trainingBatch: "Morning", monthlyFee: 600, registeredAgo: 1 },
  ]

  for (const s of students) {
    const reg = monthsAgo(s.registeredAgo)
    const student = await db.student.create({
      data: {
        admissionNo: `PSA-2026-${String(students.indexOf(s) + 1).padStart(4, "0")}`,
        registrationDate: reg,
        fullName: s.fullName,
        dateOfBirth: s.dateOfBirth,
        parentName: s.parentName,
        mobile: s.mobile,
        emergencyContact: s.emergencyContact || null,
        address: s.address || null,
        schoolName: s.schoolName || null,
        classGrade: s.classGrade || null,
        division: s.division || null,
        bloodGroup: s.bloodGroup || null,
        heightCm: s.heightCm || null,
        weightKg: s.weightKg || null,
        standingReachCm: s.standingReachCm || null,
        spikeReachCm: s.spikeReachCm || null,
        jumpReachCm: s.jumpReachCm || null,
        primarySport: s.primarySport,
        playingPosition: s.playingPosition || null,
        ageCategory: s.ageCategory,
        trainingBatch: s.trainingBatch,
        monthlyFee: s.monthlyFee,
        status: "Active",
      },
    })

    // Payments: pay all months from (reg+1) up to a "paid through" cutoff.
    // Cut-offs create a healthy mix: fully-paid, current-month unpaid, and >1-month defaulters.
    const cutoffs = [0, 0, 1, 0, 2, 3, 0, 1, 0, 2, 0, 0] // months of backlog retained
    const cutoff = cutoffs[students.indexOf(s)]
    const now = new Date()
    const lastPaidMonth = new Date(now.getFullYear(), now.getMonth() - cutoff, 1)
    const start = new Date(reg.getFullYear(), reg.getMonth() + 1, 1)

    const months: string[] = []
    const cur = new Date(start)
    while (cur <= lastPaidMonth) {
      months.push(monthKey(cur))
      cur.setMonth(cur.getMonth() + 1)
    }

    // split into receipts of max 3 months for realism
    for (let i = 0; i < months.length; i += 3) {
      const chunk = months.slice(i, i + 3)
      if (!chunk.length) continue
      const payDate = new Date(cur)
      payDate.setMonth(payDate.getMonth() - Math.floor(i / 3))
      const count = await db.feePayment.count()
      await db.feePayment.create({
        data: {
          receiptNo: `RC-${payDate.getFullYear()}${String(payDate.getMonth() + 1).padStart(2, "0")}-${String(count + 1).padStart(5, "0")}`,
          studentId: student.id,
          paymentDate: payDate,
          months: JSON.stringify(chunk),
          amount: chunk.length * s.monthlyFee,
          paymentMode: (["Cash", "UPI / GPay", "Bank Transfer"] as const)[(i / 3) % 3],
          collectedBy: "Front Desk",
        },
      })
    }

    // Achievements for a few
    if (["Aravind R Menon", "Joel Thomas", "Nandhana Suresh", "Karthik S Nair"].includes(s.fullName)) {
      await db.achievement.create({
        data: {
          studentId: student.id,
          tournamentName: "Kerala State Inter-School Volleyball Championship",
          eventDate: monthsAgo(3),
          level: "State",
          medal: s.fullName === "Joel Thomas" ? "Gold" : "Silver",
          notes: "Represented the academy squad",
        },
      })
      await db.achievement.create({
        data: {
          studentId: student.id,
          tournamentName: "Ernakulam District Youth League",
          eventDate: monthsAgo(8),
          level: "District",
          medal: "Bronze",
          notes: null,
        },
      })
    }

    // Attendance: last 3 days
    for (let d = 0; d < 3; d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      if (day.getDay() === 0) continue // skip Sundays
      await db.attendance.create({
        data: {
          studentId: student.id,
          date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
          batch: s.trainingBatch || s.ageCategory,
          status: Math.random() > 0.15 ? "Present" : "Absent",
        },
      })
    }
  }

  for (const [key, value] of Object.entries({
    academyName: "Pattern Sports Academy",
    tagline: "Building Champions, One Serve at a Time",
    address: "Municipal Stadium Road, Kochi, Kerala 682017",
    phone: "+91 484 220 1100",
    email: "office@patternsportsacademy.in",
    defaultMonthlyFee: "500",
    receiptSignatory: "Anitha Raghavan · General Secretary",
  })) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  console.log("Seed complete ✔")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
