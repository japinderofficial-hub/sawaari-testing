'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useSawaariStore } from '../lib/store';
import { api } from '../lib/api';
import { Shield, ArrowRight, Phone, Key, User, MapPin, FileText, Truck } from 'lucide-react';

// Zod validation schemas
const phoneSchema = z.object({
  phone: z.string().min(10, 'Enter a valid 10-digit number').max(15, 'Number too long'),
});

const otpSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

const passengerOnboardingSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().min(5, 'Enter a valid address'),
});

const driverOnboardingSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  licenseNo: z.string().min(5, 'Enter a valid license number'),
  vehicleNo: z.string().min(4, 'Enter a valid vehicle registration plate'),
  vehicleModel: z.string().min(2, 'Enter vehicle model'),
  aadhaarNo: z.string().length(12, 'Aadhaar number must be exactly 12 digits'),
});

type OnboardingRole = 'passenger' | 'driver';

export default function LandingPage() {
  const router = useRouter();
  const { user, token, setAuth, updateUser } = useSawaariStore();
  
  const [selectedRole, setSelectedRole] = useState<OnboardingRole | null>(null);
  const [step, setStep] = useState<'landing' | 'phone' | 'otp' | 'details'>('landing');

  // Automatic fail-safe mock bypass when running on localhost
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === 'true' || isLocalhost;
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [documentUrls, setDocumentUrls] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isBypass) return;

    const initRecaptcha = async () => {
      try {
        const { RecaptchaVerifier } = await import('firebase/auth');
        const { auth } = await import('../lib/firebase');
        if (typeof window !== 'undefined' && !(window as any).recaptchaVerifier) {
          (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
          });
        }
      } catch (err) {
        console.error('Recaptcha init failed:', err);
      }
    };
    initRecaptcha();
  }, []);

  const uploadFile = (file: File, type: string) => {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', 'http://localhost:3001/api/drivers/documents/upload');

      const tokenState = useSawaariStore.getState().token;
      if (tokenState) {
        xhr.setRequestHeader('Authorization', `Bearer ${tokenState}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [type]: percent }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.url);
          } catch (e) {
            reject(new Error('Invalid server response'));
          }
        } else {
          try {
            const response = JSON.parse(xhr.responseText);
            reject(new Error(response.message || 'Upload failed'));
          } catch (e) {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.send(formData);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB.');
      e.target.value = '';
      return;
    }

    try {
      setErrorMessage('');
      const url = await uploadFile(file, type);
      setDocumentUrls((prev) => ({ ...prev, [type]: url }));
    } catch (err: any) {
      alert(err.message || `Failed to upload ${type}`);
      e.target.value = '';
    }
  };

  // Auto redirect onboarded users
  useEffect(() => {
    if (user && user.onboarded && token) {
      if (user.role === 'passenger') router.push('/passenger');
      if (user.role === 'driver') router.push('/driver');
    }
  }, [user, token, router]);

  // Hook Forms
  const { register: registerPhone, handleSubmit: handlePhoneSubmit, formState: { errors: phoneErrors } } = useForm({
    resolver: zodResolver(phoneSchema),
  });

  const { register: registerOtp, handleSubmit: handleOtpSubmit, formState: { errors: otpErrors } } = useForm({
    resolver: zodResolver(otpSchema),
  });

  const { register: registerPassenger, handleSubmit: handlePassengerSubmit, formState: { errors: passengerErrors } } = useForm({
    resolver: zodResolver(passengerOnboardingSchema),
  });

  const { register: registerDriver, handleSubmit: handleDriverSubmit, formState: { errors: driverErrors } } = useForm({
    resolver: zodResolver(driverOnboardingSchema),
  });

  const onPhoneSubmit = async (data: { phone: string }) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      setTempPhone(data.phone);

      if (isBypass) {
        await new Promise((resolve) => setTimeout(resolve, 800)); // short delay for luxury flow feel
        setStep('otp');
        return;
      }

      // Real Firebase phone auth
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const { auth } = await import('../lib/firebase');
      
      let formattedPhone = data.phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+91${formattedPhone}`;
      }

      const verifier = (window as any).recaptchaVerifier;
      if (!verifier) {
        throw new Error('reCAPTCHA verifier not initialized. Please refresh the page.');
      }

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(confirmation);
      setStep('otp');
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || 'Failed to send OTP. Make sure you entered a valid format (e.g. +91XXXXXXXXXX).');
    } finally {
      setIsLoading(false);
    }
  };

  const onOtpSubmit = async (data: { code: string }) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      let idToken: string;
      
      console.log('DEBUG OTP SUBMIT:', {
        NEXT_PUBLIC_DEV_BYPASS: process.env.NEXT_PUBLIC_DEV_BYPASS,
        tempPhone,
        selectedRole
      });

      if (isBypass) {
        idToken = `mock-token-${selectedRole}-${tempPhone}`;
      } else {
        if (!confirmationResult) {
          throw new Error('No verification session found. Please request OTP again.');
        }
        const result = await confirmationResult.confirm(data.code);
        if (!result.user) {
          throw new Error('Failed to retrieve verified user credentials.');
        }
        idToken = await result.user.getIdToken();
      }
      
      const response = await api.post<{ user: any; token: string }>('/auth/register-or-login', {
        role: selectedRole,
        name: selectedRole === 'driver' ? 'Ramu Driver' : 'Passenger Demo',
      }, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      // Save credentials to global state
      setAuth({
        id: response.user.id,
        name: response.user.name,
        phone: response.user.phone,
        role: response.user.role,
        firebaseUid: response.user.firebaseUid,
        onboarded: false, // Wait until detail onboarding completes
      }, response.token);

      // If user profile is already fully populated on backend, we can skip to completed
      const isOnboarded = selectedRole === 'passenger'
        ? !!response.user.name
        : (!!response.user.name && !!response.user.driverProfile);

      if (isOnboarded) {
        updateUser({ onboarded: true });
        router.push(selectedRole === 'driver' ? '/driver' : '/passenger');
      } else {
        setStep('details');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Invalid verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const onPassengerDetailsSubmit = async (data: { name: string; address: string }) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      // Update name on backend
      await api.put('/users/profile', { name: data.name });

      // Save Address to locations history list
      await api.post('/users/locations', {
        name: 'Home Address',
        type: 'home',
        latitude: 12.9716, // fallback center
        longitude: 77.5946,
        address: data.address,
      });

      updateUser({ name: data.name, onboarded: true });
      router.push('/passenger');
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to complete details.');
    } finally {
      setIsLoading(false);
    }
  };

  const onDriverDetailsSubmit = async (data: { name: string; licenseNo: string; vehicleNo: string; vehicleModel: string; aadhaarNo: string }) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      if (!isBypass && (!documentUrls.license || !documentUrls.permit || !documentUrls.registration || !documentUrls.aadhaar || !documentUrls.vehicle_photo)) {
        setErrorMessage('Please upload all required documents (License, Permit, RC, Aadhaar, and Vehicle Photo).');
        setIsLoading(false);
        return;
      }

      const licenseUrl = documentUrls.license || 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg';
      const permitUrl = documentUrls.permit || 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg';
      const registrationUrl = documentUrls.registration || 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg';
      const aadhaarUrl = documentUrls.aadhaar || 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg';
      const vehiclePhotoUrl = documentUrls.vehicle_photo || 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg';

      // Update name on backend user details
      await api.put('/users/profile', { name: data.name });

      // Register driver vehicle attributes on backend
      try {
        await api.post('/drivers/register', {
          vehicleNo: data.vehicleNo,
          vehicleModel: data.vehicleModel,
          aadhaarNo: data.aadhaarNo,
        });

        // Upload documents
        await api.post('/drivers/documents', {
          type: 'license',
          url: licenseUrl,
        });
        await api.post('/drivers/documents', {
          type: 'permit',
          url: permitUrl,
        });
        await api.post('/drivers/documents', {
          type: 'registration',
          url: registrationUrl,
        });
        await api.post('/drivers/documents', {
          type: 'aadhaar',
          url: aadhaarUrl,
        });
        await api.post('/drivers/documents', {
          type: 'vehicle_photo',
          url: vehiclePhotoUrl,
        });
      } catch (regErr: any) {
        // If driver is already registered, ignore and proceed to dashboard
        if (!regErr.message?.includes('already registered')) {
          throw regErr;
        }
      }

      updateUser({ name: data.name, onboarded: true });
      router.push('/driver');
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to register driver details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleSelection = (role: OnboardingRole) => {
    setSelectedRole(role);
    setStep('phone');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden select-none">
      
      {/* Background Calm Atmosphere */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Bar */}
      <div className="w-full flex justify-between items-center z-10">
        <span className="text-sm font-bold tracking-widest text-primary">SAWAARI</span>
        <span className="text-[10px] text-muted tracking-wider flex items-center space-x-1 uppercase">
          <Shield className="w-3 h-3 text-primary" />
          <span>Secure Platform</span>
        </span>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto my-auto py-12 z-10">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: LANDING HERO */}
          {step === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center space-y-12"
            >
              <div className="space-y-4">
                <h1 className="text-5xl font-light tracking-[0.2em] text-white select-none">
                  SAWAARI
                </h1>
                <p className="text-sm text-muted tracking-[0.15em] uppercase">
                  Move Smarter.
                </p>
              </div>

              <div className="space-y-4 pt-4">
                <button
                  onClick={() => handleRoleSelection('passenger')}
                  className="w-full py-4 px-6 bg-white hover:bg-neutral-100 text-black text-sm font-semibold rounded-lg flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <span>Continue as Passenger</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleRoleSelection('driver')}
                  className="w-full py-4 px-6 bg-[#0A0A0A] hover:bg-[#111] text-white border border-border text-sm font-semibold rounded-lg flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <span>Continue as Driver</span>
                  <ArrowRight className="w-4 h-4 text-muted" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: PHONE INPUT */}
          {step === 'phone' && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-light tracking-wide text-white">Enter mobile number</h2>
                <p className="text-xs text-muted">We'll send a 6-digit verification code to log you in.</p>
              </div>

              <form onSubmit={handlePhoneSubmit(onPhoneSubmit)} className="space-y-6">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted text-sm">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    type="tel"
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3.5 pl-10 pr-4 text-sm text-white placeholder-muted focus:outline-none focus:border-primary transition-colors"
                    {...registerPhone('phone')}
                  />
                  {phoneErrors.phone && (
                    <p className="text-xs text-red-500 mt-2">{phoneErrors.phone.message as string}</p>
                  )}
                </div>

                {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setStep('landing')}
                    className="w-1/3 py-3.5 bg-[#0A0A0A] text-muted text-sm rounded-lg border border-border transition-colors hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 py-3.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Request OTP</span>}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* STEP 3: OTP INPUT */}
          {step === 'otp' && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-light tracking-wide text-white">Verification Code</h2>
                <p className="text-xs text-muted">Enter the 6-digit code sent to {tempPhone}.</p>
              </div>

              <form onSubmit={handleOtpSubmit(onOtpSubmit)} className="space-y-6">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted text-sm">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="XXXXXX"
                    className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3.5 pl-10 pr-4 text-sm text-white placeholder-muted tracking-[0.5em] text-center focus:outline-none focus:border-primary transition-colors"
                    {...registerOtp('code')}
                  />
                  {otpErrors.code && (
                    <p className="text-xs text-red-500 mt-2">{otpErrors.code.message as string}</p>
                  )}
                </div>

                <div className="text-center">
                  <span className="text-[10px] text-muted italic">Hint: Enter any 6 digits for local mock testing bypass.</span>
                </div>

                {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="w-1/3 py-3.5 bg-[#0A0A0A] text-muted text-sm rounded-lg border border-border transition-colors hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 py-3.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Verify OTP</span>}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* STEP 4: ONBOARDING DETAILS */}
          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-light tracking-wide text-white">Create Account</h2>
                <p className="text-xs text-muted">Complete your details to enter the SAWAARI network.</p>
              </div>

              {selectedRole === 'passenger' ? (
                // PASSENGER ONBOARDING FORM
                <form onSubmit={handlePassengerSubmit(onPassengerDetailsSubmit)} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">Full Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="John Doe"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerPassenger('name')}
                      />
                    </div>
                    {passengerErrors.name && (
                      <p className="text-xs text-red-500 mt-1">{passengerErrors.name.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Address (Home Location)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <MapPin className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Indiranagar, Bengaluru"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerPassenger('address')}
                      />
                    </div>
                    {passengerErrors.address && (
                      <p className="text-xs text-red-500 mt-1">{passengerErrors.address.message as string}</p>
                    )}
                  </div>

                  {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Complete Onboarding</span>}
                  </button>
                </form>
              ) : (
                // DRIVER ONBOARDING FORM
                <form onSubmit={handleDriverSubmit(onDriverDetailsSubmit)} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">Driver Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Ramu Auto"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerDriver('name')}
                      />
                    </div>
                    {driverErrors.name && (
                      <p className="text-xs text-red-500 mt-1">{driverErrors.name.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Driving License Number</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <FileText className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="DL-XXXXXXXXXXXX"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerDriver('licenseNo')}
                      />
                    </div>
                    {driverErrors.licenseNo && (
                      <p className="text-xs text-red-500 mt-1">{driverErrors.licenseNo.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Vehicle Registration Number</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <Truck className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="KA-03-XX-XXXX"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerDriver('vehicleNo')}
                      />
                    </div>
                    {driverErrors.vehicleNo && (
                      <p className="text-xs text-red-500 mt-1">{driverErrors.vehicleNo.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Vehicle Model</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <Truck className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Bajaj RE Maxima"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerDriver('vehicleModel')}
                      />
                    </div>
                    {driverErrors.vehicleModel && (
                      <p className="text-xs text-red-500 mt-1">{driverErrors.vehicleModel.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Aadhaar Number (12 digits)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
                        <FileText className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        maxLength={12}
                        placeholder="XXXX-XXXX-XXXX"
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        {...registerDriver('aadhaarNo')}
                      />
                    </div>
                    {driverErrors.aadhaarNo && (
                      <p className="text-xs text-red-500 mt-1">{driverErrors.aadhaarNo.message as string}</p>
                    )}
                  </div>

                  {/* Document Uploads */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Required Documents</h3>
                    
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Driving License (Image, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, 'license')}
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2 px-3 text-xs text-white file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                      />
                      {uploadProgress.license !== undefined && (
                        <p className="text-[10px] text-primary">Upload progress: {uploadProgress.license}%</p>
                      )}
                      {documentUrls.license && (
                        <p className="text-[10px] text-green-400">✓ License uploaded successfully</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted">Vehicle Permit (Image, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, 'permit')}
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2 px-3 text-xs text-white file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                      />
                      {uploadProgress.permit !== undefined && (
                        <p className="text-[10px] text-primary">Upload progress: {uploadProgress.permit}%</p>
                      )}
                      {documentUrls.permit && (
                        <p className="text-[10px] text-green-400">✓ Permit uploaded successfully</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted">Registration Card (RC) (Image, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, 'registration')}
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2 px-3 text-xs text-white file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                      />
                      {uploadProgress.registration !== undefined && (
                        <p className="text-[10px] text-primary">Upload progress: {uploadProgress.registration}%</p>
                      )}
                      {documentUrls.registration && (
                        <p className="text-[10px] text-green-400">✓ RC uploaded successfully</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted">Aadhaar Card (Image, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, 'aadhaar')}
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2 px-3 text-xs text-white file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                      />
                      {uploadProgress.aadhaar !== undefined && (
                        <p className="text-[10px] text-primary">Upload progress: {uploadProgress.aadhaar}%</p>
                      )}
                      {documentUrls.aadhaar && (
                        <p className="text-[10px] text-green-400">✓ Aadhaar uploaded successfully</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted">Vehicle Photo (Image, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, 'vehicle_photo')}
                        className="w-full bg-[#0A0A0A] border border-border rounded-lg py-2 px-3 text-xs text-white file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                      />
                      {uploadProgress.vehicle_photo !== undefined && (
                        <p className="text-[10px] text-primary">Upload progress: {uploadProgress.vehicle_photo}%</p>
                      )}
                      {documentUrls.vehicle_photo && (
                        <p className="text-[10px] text-green-400">✓ Vehicle Photo uploaded successfully</p>
                      )}
                    </div>
                  </div>

                  {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg flex justify-center items-center space-x-2 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Complete Onboarding</span>}
                  </button>
                </form>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Footer Text */}
      <div className="w-full text-center z-10">
        <p className="text-[10px] text-muted uppercase tracking-[0.2em] select-none">
          Real-time Auto Booking
        </p>
      </div>

      <div id="recaptcha-container"></div>
    </div>
  );
}
