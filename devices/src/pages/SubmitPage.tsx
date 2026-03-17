import { useState } from "react";
import { createSubmission } from "../api";
import DeviceForm, { type DeviceFormData } from "../components/DeviceForm";

interface Props {
  id?: string; // existing template ID for edit suggestions
}

export default function SubmitPage({ id }: Props) {
  const [success, setSuccess] = useState(false);
  const isEdit = !!id;

  const handleSubmit = async (data: DeviceFormData) => {
    await createSubmission(isEdit ? "update" : "create", data, id);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Submission received!</h2>
        <p className="text-sm text-slate-500 mb-4">
          Your {isEdit ? "edit suggestion" : "new device"} has been submitted for review. A moderator will review it shortly.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="#/my-submissions" className="text-sm text-blue-600 hover:text-blue-800">View my submissions</a>
          <span className="text-slate-300">|</span>
          <a href="#/" className="text-sm text-blue-600 hover:text-blue-800">Browse devices</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {isEdit ? "Suggest Edit" : "Submit New Device"}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {isEdit
          ? "Propose changes to an existing device template. A moderator will review your suggestion."
          : "Submit a new device template for the community library. A moderator will review it before it goes live."}
      </p>

      <DeviceForm
        id={id}
        onSubmit={handleSubmit}
        submitLabel="Submit for Review"
        cancelHref={isEdit ? `#/device/${id}` : "#/"}
      />
    </div>
  );
}
