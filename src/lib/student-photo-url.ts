type StudentWithPhoto = {
  id: string
  photoUrl?: string | null
  photoPath?: string | null
}

export function studentPhotoUrl(student: StudentWithPhoto): string {
  if (student.photoPath) return `/api/media/student-photo/${student.id}`
  return student.photoUrl || ""
}

export function withStudentPhotoUrl<T extends StudentWithPhoto>(student: T): T {
  return {
    ...student,
    photoUrl: studentPhotoUrl(student),
  }
}
