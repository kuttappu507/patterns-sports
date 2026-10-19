package `in`.patternsports.ams

import `in`.patternsports.ams.domain.BmiAssessment
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.BmiMethod
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeeCycleBucket
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.ValidationError
import `in`.patternsports.ams.domain.WHO2007_BMI_BOYS
import `in`.patternsports.ams.domain.WHO2007_BMI_GIRLS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// ============================================================
// PS-AMS :: Domain & WHO 2007 BMI Parity Unit Test Suite
// Mirrors src/lib/psams/__tests__/domain.test.ts & bmi.test.ts
// ============================================================

class DomainAndBmiParityTest {

    @Test
    fun who2007TablesHaveComplete170RowsForBoysAndGirls() {
        assertEquals(170, WHO2007_BMI_BOYS.size)
        assertEquals(170, WHO2007_BMI_GIRLS.size)
        assertEquals(60, WHO2007_BMI_BOYS.first().month)
        assertEquals(229, WHO2007_BMI_BOYS.last().month)
        assertEquals(60, WHO2007_BMI_GIRLS.first().month)
        assertEquals(229, WHO2007_BMI_GIRLS.last().month)
    }

    @Test
    fun parseLocalDateRejectsImpossibleCalendarDays() {
        assertNull(DomainEngine.parseLocalDate("2026-02-30"))
        assertNull(DomainEngine.parseLocalDate("2025-02-29"))
        assertNotNull(DomainEngine.parseLocalDate("2024-02-29"))
        assertEquals(LocalDate.of(2011, 5, 14), DomainEngine.parseLocalDate("2011-05-14"))
    }

    @Test
    fun computeAgeAndSuggestAgeCategoryMatchVolleyballBrackets() {
        val ref = LocalDate.of(2026, 10, 18)
        assertEquals(8, DomainEngine.computeAge("2018-04-10", ref))
        assertEquals("Mini", DomainEngine.suggestAgeCategory(9))
        assertEquals("Sub-Junior", DomainEngine.suggestAgeCategory(12))
        assertEquals("Junior", DomainEngine.suggestAgeCategory(15))
        assertEquals("Youth", DomainEngine.suggestAgeCategory(18))
        assertEquals("Senior", DomainEngine.suggestAgeCategory(19))
    }

    @Test
    fun who2007BmiForAgeAssessmentsMatchReferenceCutoffs() {
        // 14-year-old boy (168 cm, 52 kg -> BMI 18.42 -> Normal weight under WHO 2007)
        val res = BmiEngine.assessBmi(
            weightKg = 52.0,
            heightCm = 168.0,
            dateOfBirth = "2011-05-14",
            gender = "Male",
            measurementDate = "2025-05-14",
        )
        assertTrue(res is BmiAssessment.Ok)
        val ok = res as BmiAssessment.Ok
        assertEquals(BmiMethod.WHO_5_19, ok.method)
        assertEquals("Normal weight", ok.classification)
        assertEquals("normal-weight", ok.classificationKind)
        assertNotNull(ok.zScore)
        assertNotNull(ok.percentile)

        // 20-year-old adult uses WHO adult bands
        val adult = BmiEngine.assessBmi(
            weightKg = 71.0,
            heightCm = 185.0,
            dateOfBirth = "2004-01-10",
            gender = "Male",
            measurementDate = "2026-05-10",
        ) as BmiAssessment.Ok
        assertEquals(BmiMethod.ADULT_20PLUS, adult.method)
        assertEquals("Healthy-weight range", adult.classification)
    }

    @Test
    fun computeFeeStatusTreatsJoiningMonthAsComplimentary() {
        val student = Student(
            id = "s1",
            admissionNo = "PSA-2026-0001",
            fullName = "Aravind R Menon",
            dateOfBirth = "2011-05-14",
            registrationDate = "2026-01-12",
            parentName = "Ramesh Menon",
            mobile = "9847012001",
            address = "Kaloor",
            schoolName = "Bhavans",
            classGrade = "9",
            division = "A",
            bloodGroup = "O+",
            gender = "Male",
            primarySport = "Volleyball",
            ageCategory = "Junior",
            trainingBatch = "Evening",
            monthlyFee = 600.0,
            status = "Active",
            createdAt = "2026-01-12T00:00:00Z",
            updatedAt = "2026-01-12T00:00:00Z",
        )
        val payment = FeePayment(
            id = "p1",
            receiptNo = "RC-202602-00001",
            studentId = "s1",
            amount = 600.0,
            months = "[\"2026-02\"]",
            paymentDate = "2026-02-10",
            paymentMode = "Cash",
            createdAt = "2026-02-10T00:00:00Z",
        )

        val statusAtApril = DomainEngine.computeFeeStatus(
            student = student,
            payments = listOf(payment),
            now = LocalDate.of(2026, 4, 15),
        )
        // Jan is complimentary; Feb is paid; Mar & Apr are pending; Mar is overdue (1 overdue month -> not defaulter yet)
        assertEquals(listOf("2026-02"), statusAtApril.paidMonths)
        assertEquals(listOf("2026-03", "2026-04"), statusAtApril.pendingMonths)
        assertEquals(listOf("2026-03"), statusAtApril.overdueMonths)
        assertEquals(1200.0, statusAtApril.dueAmount, 0.001)
        assertFalse(statusAtApril.isDefaulter)
        assertEquals(FeeCycleBucket.DUE, DomainEngine.classifyFeeCycle(statusAtApril))

        val statusAtMay = DomainEngine.computeFeeStatus(
            student = student,
            payments = listOf(payment),
            now = LocalDate.of(2026, 5, 15),
        )
        // Mar & Apr are overdue (>1 overdue month -> defaulter)
        assertTrue(statusAtMay.isDefaulter)
        assertEquals(FeeCycleBucket.DEFAULTER, DomainEngine.classifyFeeCycle(statusAtMay))
    }

    @Test
    fun phoneDigitsStripsIndianCountryCodeAndLeadingZero() {
        assertEquals("9847012345", DomainEngine.phoneDigits("+91 98470 12345"))
        assertEquals("9847012345", DomainEngine.phoneDigits("09847012345"))
        assertEquals("9847012345", DomainEngine.phoneDigits("91-98470-12345"))
    }

    @Test
    fun numberingAndIndianFormattingMatchSpec() {
        assertEquals("PSA-2026-0003", DomainEngine.nextAdmissionNo(listOf("PSA-2026-0001", "PSA-2026-0002"), 2026))
        assertEquals(
            "RC-202610-00002",
            DomainEngine.nextReceiptNo(listOf("RC-202610-00001"), LocalDate.of(2026, 10, 18))
        )
        assertEquals("₹1,25,000", DomainEngine.formatINR(125000.0))
        assertEquals("One Thousand Eight Hundred Rupees Only", DomainEngine.inWords(1800.0))
    }

    @Test(expected = ValidationError::class)
    fun assertValidPaymentRejectsDuplicateMonths() {
        DomainEngine.assertValidPayment(
            months = listOf("2026-03"),
            amount = 600.0,
            monthlyFee = 600.0,
            alreadyPaidMonths = listOf("2026-03"),
            registrationDate = "2026-01-10",
            now = LocalDate.of(2026, 4, 10),
        )
    }
}
