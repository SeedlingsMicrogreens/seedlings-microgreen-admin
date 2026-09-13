"use client";
import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {listCollection,updateRecord} from "@/lib/firestore";
import { confirmAction, showSuccess } from "@/lib/alerts";
import type {AdminUser,AdminRole,UserStatus} from "@/types/security";

export default function AdminUsersPage(){
 const[users,setUsers]=useState<AdminUser[]>([]);const[error,setError]=useState("");
 async function load(){try{setUsers(await listCollection<AdminUser>("userProfiles","updatedAt"))}catch{setError("Unable to load admin users.")}}
 useEffect(()=>{void load()},[]);
 async function save(u:AdminUser,role:AdminRole,status:UserStatus){const accessChanged=role!==u.role||status!==u.status;if(accessChanged && !(await confirmAction({title:"Change admin access?",text:`This will change ${u.email||u.id} to role ${role} with status ${status}. This action cannot be undone.`,confirmText:"Yes, change access"})))return;try{await updateRecord("userProfiles",u.id,{role,status}) ;await load();await showSuccess("Admin access updated")}catch{setError("Unable to update user.")}}
 return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Admin Users</h1><p className="text-muted">Manage administrative access and account status.</p>{error&&<div className="alert alert-danger">{error}</div>}
 <div className="alert alert-warning"><strong>Security:</strong> New Firebase Authentication users should be created through the approved provisioning process. This screen only manages existing profile authorization.</div>
 <div className="card"><div className="card-body table-responsive p-0"><table className="table table-hover mb-0"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
 {users.map(u=><tr key={u.id}><td>{u.email||u.id}<div className="small text-muted">{u.displayName||""}</div></td><td><select className="form-select form-select-sm" value={u.role} onChange={e=>save(u,e.target.value as AdminRole,u.status)}><option>ADMIN</option><option>SUPER_ADMIN</option><option>OPERATIONS</option></select></td><td><select className="form-select form-select-sm" value={u.status} onChange={e=>save(u,u.role,e.target.value as UserStatus)}><option>active</option><option>inactive</option><option>suspended</option></select></td><td className="text-muted small">Changes save immediately</td></tr>)}
 {!users.length&&<tr><td colSpan={4} className="text-center text-muted py-4">No admin profiles found.</td></tr>}</tbody></table></div></div>
 </div></AdminPage>
}
