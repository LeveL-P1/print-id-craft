"use client"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowRight, Upload, CheckCircle2 } from "lucide-react"
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { v4 as uuidv4 } from "uuid"
import { supabase } from "@/lib/supabase"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { QRCodeSVG } from 'qrcode.react' 

type FieldType = "TEXT" | "DATE" | "SELECT" | "PHOTO" | "SIGNATURE"

type FormConfig = {
  schoolId: string
  classGroupId: string
  schoolName: string
  className: string
  logo: string | null
  primaryColor: string | null
  fields: { id: string, fieldName: string, fieldType: FieldType, isRequired: boolean }[]
}

const STEP_DETAILS = 1
const STEP_PHOTO = 2
const STEP_PREVIEW = 3
const STEP_SUCCESS = 4

// Helper to center crop aspect ratio
function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight), mediaWidth, mediaHeight)
}

export default function StudentForm() {
  const params = useParams()
  const submissionLink = params.submissionLink as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [config, setConfig] = useState<FormConfig | null>(null)
  
  const [step, setStep] = useState(STEP_DETAILS)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [qrToken, setQrToken] = useState("")
  const [serialNumber, setSerialNumber] = useState("")

  // Image Crop State
  const [imgSrc, setImgSrc] = useState("")
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<any>()
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [croppedImgUrl, setCroppedImgUrl] = useState("")
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // Check local storage for existing session/qrToken on mount to prevent double submissions.
    // Omitted in basic impl for simplicity.
    fetch(`/api/form/${submissionLink}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setConfig(res.data)
        else setError("Invalid or inactive form link.")
      })
      .catch(() => setError("Failed to load form."))
      .finally(() => setLoading(false))
  }, [submissionLink])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: e.target.value }))
  }

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep(STEP_PHOTO)
  }

  // Handle Photo selection
  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined)
      const reader = new FileReader()
      reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''))
      reader.readAsDataURL(e.target.files[0])
    }
  }

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, 1)) // 1:1 square for ID photo
  }

  const finalizeCrop = async () => {
      // Basic client-side canvas crop implementation
      if (!imgRef.current || !completedCrop) return
      const canvas = document.createElement("canvas")
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height
      canvas.width = completedCrop.width
      canvas.height = completedCrop.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0, 0,
        completedCrop.width, completedCrop.height
      )

      canvas.toBlob((blob) => {
         if (!blob) return
         setPhotoBlob(blob)
         setCroppedImgUrl(URL.createObjectURL(blob))
         setStep(STEP_PREVIEW)
      }, "image/jpeg", 0.95)
  }

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    try {
       // 1. Upload cropped image to Supabase Storage
       let photoUrl = ""
       if (photoBlob && config) {
         const fileUuid = uuidv4()
         const fileName = `${config.schoolId}/${fileUuid}.jpg`
         // Use Student-Photos bucket
         const { data, error } = await supabase.storage.from("student-photos").upload(fileName, photoBlob, {
           contentType: "image/jpeg"
         })
         
         if (error && error.message !== 'The resource already exists') {
           console.error("Storage upload error", error)
         }

         if (data) {
           const { data: publicUrlData } = supabase.storage.from("student-photos").getPublicUrl(fileName)
           photoUrl = publicUrlData.publicUrl
         }
       }

       // 2. Submit form to API
       const token = uuidv4()
       const res = await fetch(`/api/form/${submissionLink}/submit`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           formData,
           photoUrl,
           qrToken: token
         })
       })

       const resJson = await res.json()
       if (resJson.success) {
          setQrToken(token)
          setSerialNumber(resJson.data.student.serialNumber)
          setStep(STEP_SUCCESS)
       } else {
         setError(resJson.error || "Submission failed")
       }
    } catch (err) {
       console.error(err)
       setError("Network error.")
    } finally {
       setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>
  if (error || !config) return <div className="p-8 text-center text-red-500">{error}</div>

  const pColor = config.primaryColor || "#4f46e5"

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* progress bar */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center justify-between text-sm font-medium text-slate-500 mb-2">
           <span className={step >= STEP_DETAILS ? `text-[${pColor}]` : ""}>Details</span>
           <span className={step >= STEP_PHOTO ? `text-[${pColor}]` : ""}>Photo</span>
           <span className={step >= STEP_PREVIEW ? `text-[${pColor}]` : ""}>Review</span>
           <span className={step >= STEP_SUCCESS ? `text-[${pColor}]` : ""}>Done</span>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full transition-all duration-300" style={{ backgroundColor: pColor, width: `${(step/4)*100}%` }} />
        </div>
      </div>

      <Card className="w-full max-w-2xl overflow-hidden border-0 shadow-xl relative">
        <div className="absolute top-0 w-full h-3" style={{ backgroundColor: pColor }} />
        
        {step === STEP_DETAILS && (
          <form onSubmit={handleDetailsSubmit}>
            <CardHeader className="text-center pt-8 pb-4">
              <h2 className="text-2xl font-bold">{config.schoolName}</h2>
              <p className="text-muted-foreground">{config.className} ID Card Registration</p>
            </CardHeader>
            <CardContent className="space-y-4">
               {config.fields.filter(f => f.fieldType !== "PHOTO" && f.fieldType !== "SIGNATURE").map(field => (
                 <div key={field.id} className="space-y-2">
                   <Label>{field.fieldName} {field.isRequired && <span className="text-red-500">*</span>}</Label>
                   <Input 
                      required={field.isRequired}
                      type={field.fieldType === "DATE" ? "date" : "text"}
                      value={formData[field.fieldName] || ""}
                      onChange={(e) => handleInputChange(e, field.fieldName)}
                   />
                 </div>
               ))}
            </CardContent>
            <CardFooter>
               <Button type="submit" className="w-full" style={{ backgroundColor: pColor, color: "white" }}>
                 Next Step <ArrowRight className="w-4 h-4 ml-2" />
               </Button>
            </CardFooter>
          </form>
        )}

        {step === STEP_PHOTO && (
          <div>
            <CardHeader className="text-center pt-8 pb-4">
              <h2 className="text-xl font-bold">Upload Your Photo</h2>
              <p className="text-sm text-muted-foreground">Please provide a clear front-facing photo.</p>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-col items-center">
              <div className="w-full max-w-sm">
                <Input type="file" accept="image/png, image/jpeg" onChange={onSelectFile} className="mb-4" />
                {imgSrc && (
                   <ReactCrop
                     crop={crop}
                     onChange={(c) => setCrop(c)}
                     onComplete={(c) => setCompletedCrop(c)}
                     aspect={1}
                     circularCrop
                   >
                     <img ref={imgRef} alt="Crop me" src={imgSrc} onLoad={onImageLoad} className="max-h-[50vh] object-contain" />
                   </ReactCrop>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
               <Button variant="ghost" onClick={() => setStep(STEP_DETAILS)}>Back</Button>
               <Button 
                  disabled={!completedCrop || !completedCrop.width || !completedCrop.height} 
                  onClick={finalizeCrop} 
                  style={{ backgroundColor: pColor, color: "white" }}>
                 Crop & Continue
               </Button>
            </CardFooter>
          </div>
        )}

        {step === STEP_PREVIEW && (
          <div>
            <CardHeader className="text-center pt-8 pb-4">
              <h2 className="text-xl font-bold">Review Your Details</h2>
              <p className="text-sm text-muted-foreground">Verify your information before final submission.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center mb-6">
                {croppedImgUrl && <img src={croppedImgUrl} alt="Preview" className="w-32 h-32 rounded-full border-4 shadow-md object-cover" style={{ borderColor: pColor }} />}
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                 {Object.entries(formData).map(([k, v]) => (
                   <div key={k} className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
                     <span className="text-muted-foreground text-sm font-medium">{k}</span>
                     <span className="text-sm font-semibold">{v}</span>
                   </div>
                 ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
               <Button variant="ghost" disabled={submitting} onClick={() => setStep(STEP_PHOTO)}>Back</Button>
               <Button onClick={handleFinalSubmit} disabled={submitting} style={{ backgroundColor: pColor, color: "white" }}>
                 {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                 Submit Registration
               </Button>
            </CardFooter>
          </div>
        )}

        {step === STEP_SUCCESS && (
          <div className="text-center">
            <CardContent className="pt-12 pb-8 flex flex-col items-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Registration Complete!</h2>
              <p className="text-muted-foreground mt-2 max-w-sm">
                Your ID card details have been securely submitted and are pending review. Here is your digital verification token.
              </p>

              <div className="mt-8 bg-white p-4 rounded-xl border-2 border-dashed border-slate-200">
                <QRCodeSVG value={`https://printid.vercel.app/verify/${qrToken}`} size={160} />
              </div>
              <Badge variant="outline" className="mt-4 font-mono text-xs px-3 py-1 bg-slate-50">ID: {serialNumber}</Badge>
            </CardContent>
            <CardFooter className="justify-center pb-8">
               <p className="text-sm text-muted-foreground">You may now close this window.</p>
            </CardFooter>
          </div>
        )}
      </Card>
      {/* Basic Footer Branding */}
      <div className="mt-8 text-center text-xs text-slate-400 font-medium">Powered by PrintID Pro System</div>
    </div>
  )
}
