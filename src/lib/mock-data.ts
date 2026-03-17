export interface School {
  id: string;
  name: string;
  logo: string;
  address: string;
  board: string;
  primaryColor: string;
  activeClasses: number;
  totalStudents: number;
  submittedCount: number;
  status: "active" | "inactive";
  classes: SchoolClass[];
}

export interface SchoolClass {
  id: string;
  name: string;
  section: string;
  totalStudents: number;
  submittedCount: number;
  teacherName: string;
  submissionLink: string;
}

export interface Student {
  id: string;
  name: string;
  rollNo: string;
  className: string;
  section: string;
  dob: string;
  bloodGroup: string;
  photo: string;
  submittedAt: string;
  status: "submitted" | "pending" | "approved" | "flagged";
  flagNote?: string;
  serialNumber: string;
}

export interface PrintBatch {
  id: string;
  schoolName: string;
  className: string;
  cardsCount: number;
  generatedAt: string;
  status: "generating" | "ready" | "printed" | "error";
  type: "front" | "back";
}

export interface Activity {
  id: string;
  message: string;
  timestamp: string;
  type: "submission" | "approval" | "batch" | "school";
}

export const mockSchools: School[] = [
  {
    id: "s1", name: "Delhi Public School, Vasant Kunj", logo: "DPS",
    address: "Vasant Kunj, New Delhi - 110070", board: "CBSE",
    primaryColor: "#1e40af", activeClasses: 12, totalStudents: 480,
    submittedCount: 312, status: "active",
    classes: [
      { id: "c1", name: "Class 6", section: "A", totalStudents: 40, submittedCount: 35, teacherName: "Mrs. Sharma", submissionLink: "/submit/s1/c1" },
      { id: "c2", name: "Class 6", section: "B", totalStudents: 40, submittedCount: 28, teacherName: "Mr. Verma", submissionLink: "/submit/s1/c2" },
      { id: "c3", name: "Class 7", section: "A", totalStudents: 40, submittedCount: 40, teacherName: "Mrs. Gupta", submissionLink: "/submit/s1/c3" },
      { id: "c4", name: "Class 7", section: "B", totalStudents: 40, submittedCount: 22, teacherName: "Mr. Singh", submissionLink: "/submit/s1/c4" },
    ],
  },
  {
    id: "s2", name: "Ryan International School", logo: "RIS",
    address: "Sector 25, Gurugram - 122002", board: "ICSE",
    primaryColor: "#059669", activeClasses: 8, totalStudents: 320,
    submittedCount: 180, status: "active",
    classes: [
      { id: "c5", name: "Class 5", section: "A", totalStudents: 40, submittedCount: 30, teacherName: "Mrs. Kapoor", submissionLink: "/submit/s2/c5" },
      { id: "c6", name: "Class 5", section: "B", totalStudents: 40, submittedCount: 25, teacherName: "Mr. Joshi", submissionLink: "/submit/s2/c6" },
    ],
  },
  {
    id: "s3", name: "St. Mary's Convent School", logo: "SMC",
    address: "Civil Lines, Allahabad - 211001", board: "CBSE",
    primaryColor: "#9333ea", activeClasses: 10, totalStudents: 400,
    submittedCount: 95, status: "active",
    classes: [
      { id: "c7", name: "Class 8", section: "A", totalStudents: 45, submittedCount: 10, teacherName: "Sr. Mary", submissionLink: "/submit/s3/c7" },
    ],
  },
  {
    id: "s4", name: "Kendriya Vidyalaya No. 2", logo: "KV",
    address: "Cantonment, Pune - 411001", board: "CBSE",
    primaryColor: "#dc2626", activeClasses: 6, totalStudents: 240,
    submittedCount: 0, status: "inactive",
    classes: [],
  },
];

export const mockStudents: Student[] = [
  { id: "st1", name: "Aarav Patel", rollNo: "001", className: "Class 6", section: "A", dob: "2012-05-14", bloodGroup: "B+", photo: "", submittedAt: "2024-03-15 10:30", status: "approved", serialNumber: "DPS-6A-001" },
  { id: "st2", name: "Priya Sharma", rollNo: "002", className: "Class 6", section: "A", dob: "2012-08-22", bloodGroup: "O+", photo: "", submittedAt: "2024-03-15 11:15", status: "approved", serialNumber: "DPS-6A-002" },
  { id: "st3", name: "Rohan Gupta", rollNo: "003", className: "Class 6", section: "A", dob: "2012-01-30", bloodGroup: "A+", photo: "", submittedAt: "2024-03-15 14:20", status: "submitted", serialNumber: "DPS-6A-003" },
  { id: "st4", name: "Ananya Singh", rollNo: "004", className: "Class 6", section: "A", dob: "2012-11-05", bloodGroup: "AB+", photo: "", submittedAt: "2024-03-14 09:45", status: "flagged", flagNote: "Photo is blurry, please re-upload", serialNumber: "DPS-6A-004" },
  { id: "st5", name: "Kabir Mehta", rollNo: "005", className: "Class 6", section: "A", dob: "2012-07-18", bloodGroup: "B-", photo: "", submittedAt: "", status: "pending", serialNumber: "DPS-6A-005" },
  { id: "st6", name: "Ishita Reddy", rollNo: "006", className: "Class 6", section: "A", dob: "2012-03-25", bloodGroup: "O-", photo: "", submittedAt: "2024-03-16 08:00", status: "submitted", serialNumber: "DPS-6A-006" },
  { id: "st7", name: "Arjun Nair", rollNo: "007", className: "Class 6", section: "A", dob: "2012-09-12", bloodGroup: "A-", photo: "", submittedAt: "2024-03-16 09:30", status: "approved", serialNumber: "DPS-6A-007" },
  { id: "st8", name: "Diya Joshi", rollNo: "008", className: "Class 6", section: "A", dob: "2012-12-01", bloodGroup: "B+", photo: "", submittedAt: "", status: "pending", serialNumber: "DPS-6A-008" },
];

export const mockBatches: PrintBatch[] = [
  { id: "B001", schoolName: "Delhi Public School", className: "Class 6-A", cardsCount: 35, generatedAt: "2024-03-16 14:00", status: "ready", type: "front" },
  { id: "B002", schoolName: "Delhi Public School", className: "Class 6-A", cardsCount: 35, generatedAt: "2024-03-16 14:05", status: "ready", type: "back" },
  { id: "B003", schoolName: "Ryan International", className: "Class 5-A", cardsCount: 30, generatedAt: "2024-03-15 10:00", status: "printed", type: "front" },
  { id: "B004", schoolName: "Ryan International", className: "Class 5-A", cardsCount: 30, generatedAt: "2024-03-15 10:05", status: "printed", type: "back" },
  { id: "B005", schoolName: "St. Mary's Convent", className: "Class 8-A", cardsCount: 10, generatedAt: "2024-03-17 09:00", status: "generating", type: "front" },
];

export const mockActivities: Activity[] = [
  { id: "a1", message: "35 submissions received from DPS Class 6-A", timestamp: "2 min ago", type: "submission" },
  { id: "a2", message: "Batch B001 generated for DPS Class 6-A (Front)", timestamp: "15 min ago", type: "batch" },
  { id: "a3", message: "Mrs. Sharma approved 5 ID cards", timestamp: "1 hour ago", type: "approval" },
  { id: "a4", message: "Ryan International School onboarded", timestamp: "3 hours ago", type: "school" },
  { id: "a5", message: "Print batch B003 marked as printed", timestamp: "5 hours ago", type: "batch" },
  { id: "a6", message: "12 new submissions from St. Mary's Class 8-A", timestamp: "1 day ago", type: "submission" },
];
