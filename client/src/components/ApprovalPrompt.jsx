import { useEffect, useRef, useState } from "react";
import { registerApprovalHandler } from "../approvalBridge";

// Manager-override dialog. Appears whenever the server answers a request
// with APPROVAL_REQUIRED (e.g. a discount above the cashier's limit); the
// request is retried automatically with the admin's username + PIN.
export default function ApprovalPrompt() {
    const [request, setRequest] = useState(null); // { message, invalid, resolve }
    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const userRef = useRef(null);

    useEffect(() => registerApprovalHandler(({ message, invalid }) => new Promise((resolve) => {
        setPin("");
        setRequest({ message, invalid, resolve });
    })), []);

    useEffect(() => { if (request) userRef.current?.focus(); }, [request]);

    if (!request) return null;

    const finish = (value) => {
        request.resolve(value);
        setRequest(null);
        setPin("");
    };

    const submit = (e) => {
        e.preventDefault();
        if (!username.trim() || !pin) return;
        finish({ username: username.trim(), pin });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="approval-title">
            <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-sm shadow-2xl w-full max-w-sm p-6 space-y-4">
                <div>
                    <h2 id="approval-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">Manager approval needed</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{request.message}</p>
                    {request.invalid && (
                        <p className="text-sm text-red-600 mt-2" role="alert">That username or PIN wasn&apos;t accepted. Try again.</p>
                    )}
                </div>
                <label className="block text-sm">
                    <span className="text-gray-700 dark:text-gray-200">Manager username</span>
                    <input
                        ref={userRef}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="off"
                        className="mt-1 w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2"
                    />
                </label>
                <label className="block text-sm">
                    <span className="text-gray-700 dark:text-gray-200">Approval PIN</span>
                    <input
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        className="mt-1 w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 tracking-widest"
                    />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => finish(null)} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                        Cancel
                    </button>
                    <button type="submit" disabled={!username.trim() || pin.length < 4} className="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-50">
                        Approve
                    </button>
                </div>
            </form>
        </div>
    );
}
