// TỰ SINH bằng "npm run gen:types" từ supabase/migrations — KHÔNG sửa tay.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_modules": {
                  Row: {
                    "key": string,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"label": string,"sort_order": number
                  }
                  Update: {
                    "key"?: string,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"backups": {
                  Row: {
                    "company_id": string,"counts": NonNullable<Json>,"created_at": string,"created_by": string | null,"data": NonNullable<Json>,"id": string,"kind": string,"note": string | null,"size_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"counts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"data": NonNullable<Json>,"id"?: string,"kind"?: string,"note"?: string | null,"size_bytes"?: number
                  }
                  Update: {
                    "company_id"?: string,"counts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"note"?: string | null,"size_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "backups_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_items": {
                  Row: {
                    "archived": boolean,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"kind": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"logo_url": string | null,"name": string,"short_name": string | null,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"logo_url"?: string | null,"name": string,"short_name"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"logo_url"?: string | null,"name"?: string,"short_name"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_private": {
                  Row: {
                    "bank_account": string | null,"bank_holder": string | null,"bank_name": string | null,"company_id": string,"created_at": string,"created_by": string | null,"customer_id": string | null,"date_of_birth": string | null,"deleted_at": string | null,"deleted_by": string | null,"employee_id": string | null,"gender": string | null,"hometown": string | null,"id": string,"id_issued_on": string | null,"id_issued_place": string | null,"id_number": string | null,"permanent_address": string | null,"phone": string | null,"subcontractor_id": string | null,"updated_at": string,"worker_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bank_account"?: string | null,"bank_holder"?: string | null,"bank_name"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"date_of_birth"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"employee_id"?: string | null,"gender"?: string | null,"hometown"?: string | null,"id"?: string,"id_issued_on"?: string | null,"id_issued_place"?: string | null,"id_number"?: string | null,"permanent_address"?: string | null,"phone"?: string | null,"subcontractor_id"?: string | null,"updated_at"?: string,"worker_id"?: string | null
                  }
                  Update: {
                    "bank_account"?: string | null,"bank_holder"?: string | null,"bank_name"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"date_of_birth"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"employee_id"?: string | null,"gender"?: string | null,"hometown"?: string | null,"id"?: string,"id_issued_on"?: string | null,"id_issued_place"?: string | null,"id_number"?: string | null,"permanent_address"?: string | null,"phone"?: string | null,"subcontractor_id"?: string | null,"updated_at"?: string,"worker_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_private_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_private_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_private_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: true
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_private_subcontractor_id_fkey"
      columns: ["subcontractor_id"]
isOneToOne: true
      referencedRelation: "subcontractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_private_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: true
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_allocations": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"data": NonNullable<Json>,"deleted_at": string | null,"deleted_by": string | null,"id": string,"kind": string,"name": string | null,"project_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind": string,"name"?: string | null,"project_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string | null,"project_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_allocations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"email": string | null,"full_name": string | null,"id": string,"name": string,"note": string | null,"tax_code": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"full_name"?: string | null,"id"?: string,"name": string,"note"?: string | null,"tax_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"full_name"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"tax_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "archived": boolean,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"full_name": string,"id": string,"note": string | null,"profile_id": string | null,"started_on": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"full_name": string,"id"?: string,"note"?: string | null,"profile_id"?: string | null,"started_on"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"full_name"?: string,"id"?: string,"note"?: string | null,"profile_id"?: string | null,"started_on"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"equipment": {
                  Row: {
                    "company_id": string,"condition": string,"created_at": string,"created_by": string | null,"date": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"location": string,"name_id": string,"note": string | null,"project_id": string | null,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"condition"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"location": string,"name_id": string,"note"?: string | null,"project_id"?: string | null,"quantity"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"condition"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"location"?: string,"name_id"?: string,"note"?: string | null,"project_id"?: string | null,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "equipment_name_id_fkey"
      columns: ["name_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "equipment_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_lines": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"discount": string | null,"expense_id": string,"id": string,"name": string,"note": string | null,"position": number,"quantity": number,"unit": string | null,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"discount"?: string | null,"expense_id": string,"id"?: string,"name"?: string,"note"?: string | null,"position"?: number,"quantity"?: number,"unit"?: string | null,"unit_price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"discount"?: string | null,"expense_id"?: string,"id"?: string,"name"?: string,"note"?: string | null,"position"?: number,"quantity"?: number,"unit"?: string | null,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_lines_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"buyer_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"description": string,"expense_type_id": string,"id": string,"invoice_no": string | null,"paid_at_purchase": boolean,"project_id": string,"receipt_image_path": string | null,"source": string,"supplier_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"buyer_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string,"expense_type_id": string,"id"?: string,"invoice_no"?: string | null,"paid_at_purchase"?: boolean,"project_id": string,"receipt_image_path"?: string | null,"source"?: string,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"buyer_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string,"expense_type_id"?: string,"id"?: string,"invoice_no"?: string | null,"paid_at_purchase"?: boolean,"project_id"?: string,"receipt_image_path"?: string | null,"source"?: string,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_expense_type_id_fkey"
      columns: ["expense_type_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"main_contracts": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"customer_name": string | null,"date": string | null,"deleted_at": string | null,"deleted_by": string | null,"description": string | null,"extra_value": number,"id": string,"items": NonNullable<Json>,"legacy_variation": number,"project_id": string,"quantity": number | null,"unit_price": number | null,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_name"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"extra_value"?: number,"id"?: string,"items"?: NonNullable<Json>,"legacy_variation"?: number,"project_id": string,"quantity"?: number | null,"unit_price"?: number | null,"updated_at"?: string,"value"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_name"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"extra_value"?: number,"id"?: string,"items"?: NonNullable<Json>,"legacy_variation"?: number,"project_id"?: string,"quantity"?: number | null,"unit_price"?: number | null,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "main_contracts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "main_contracts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"payable_closures": {
                  Row: {
                    "amount": number,"closed_by_name": string | null,"closed_on": string,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"note": string | null,"party_kind": string,"project_id": string | null,"subcontractor_id": string | null,"supplier_id": string | null,"undone_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number,"closed_by_name"?: string | null,"closed_on": string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"note"?: string | null,"party_kind": string,"project_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"undone_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"closed_by_name"?: string | null,"closed_on"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"note"?: string | null,"party_kind"?: string,"project_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"undone_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payable_closures_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payable_closures_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payable_closures_subcontractor_id_fkey"
      columns: ["subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payable_closures_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"expense_id": string | null,"id": string,"payment_id": string,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"expense_id"?: string | null,"id"?: string,"payment_id": string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"expense_id"?: string | null,"id"?: string,"payment_id"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "allocation_mode": string,"amount": number,"closure_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"id": string,"kind": string,"note": string | null,"project_id": string | null,"subcontract_id": string | null,"subcontractor_id": string | null,"supplier_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_mode"?: string,"amount": number,"closure_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"project_id"?: string | null,"subcontract_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allocation_mode"?: string,"amount"?: number,"closure_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"project_id"?: string | null,"subcontract_id"?: string | null,"subcontractor_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_closure_id_fkey"
      columns: ["closure_id"]
isOneToOne: false
      referencedRelation: "payable_closures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_subcontract_id_fkey"
      columns: ["subcontract_id"]
isOneToOne: false
      referencedRelation: "subcontracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_subcontractor_id_fkey"
      columns: ["subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_projects": {
                  Row: {
                    "company_id": string,"created_at": string,"profile_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"profile_id": string,"project_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"profile_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_projects_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_projects_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_projects_project_fk"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"display_name": string,"id": string,"is_locked": boolean,"must_change_password": boolean,"project_scope": string,"role_id": string,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"display_name": string,"id": string,"is_locked"?: boolean,"must_change_password"?: boolean,"project_scope"?: string,"role_id": string,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"display_name"?: string,"id"?: string,"is_locked"?: boolean,"must_change_password"?: boolean,"project_scope"?: string,"role_id"?: string,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "address": string | null,"aliases": (string)[],"closed_date": string | null,"company_id": string,"completed_date": string | null,"cost_weight_k": number | null,"created_at": string,"created_by": string | null,"created_year": number | null,"customer_id": string | null,"deleted_at": string | null,"deleted_by": string | null,"end_date": string | null,"floor_areas": NonNullable<Json>,"id": string,"is_company_overhead": boolean,"kind": string | null,"name": string,"note": string | null,"owner_name": string | null,"scope_note": string | null,"start_date": string | null,"start_date_user_edited": boolean,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"aliases"?: (string)[],"closed_date"?: string | null,"company_id"?: string,"completed_date"?: string | null,"cost_weight_k"?: number | null,"created_at"?: string,"created_by"?: string | null,"created_year"?: number | null,"customer_id"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"end_date"?: string | null,"floor_areas"?: NonNullable<Json>,"id"?: string,"is_company_overhead"?: boolean,"kind"?: string | null,"name": string,"note"?: string | null,"owner_name"?: string | null,"scope_note"?: string | null,"start_date"?: string | null,"start_date_user_edited"?: boolean,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"aliases"?: (string)[],"closed_date"?: string | null,"company_id"?: string,"completed_date"?: string | null,"cost_weight_k"?: number | null,"created_at"?: string,"created_by"?: string | null,"created_year"?: number | null,"customer_id"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"end_date"?: string | null,"floor_areas"?: NonNullable<Json>,"id"?: string,"is_company_overhead"?: boolean,"kind"?: string | null,"name"?: string,"note"?: string | null,"owner_name"?: string | null,"scope_note"?: string | null,"start_date"?: string | null,"start_date_user_edited"?: boolean,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"id": string,"is_auto": boolean,"kind": string,"note": string | null,"project_id": string,"settlement_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_auto"?: boolean,"kind"?: string,"note"?: string | null,"project_id": string,"settlement_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_auto"?: boolean,"kind"?: string,"note"?: string | null,"project_id"?: string,"settlement_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_settlement_id_fkey"
      columns: ["settlement_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "company_id": string,"level": string,"module": string,"role_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"level"?: string,"module": string,"role_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"level"?: string,"module"?: string,"role_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"default_project_scope": string,"deleted_at": string | null,"description": string | null,"edit_others": boolean,"id": string,"is_admin": boolean,"name": string,"purge_trash": boolean,"see_contact_ids": boolean,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"default_project_scope"?: string,"deleted_at"?: string | null,"description"?: string | null,"edit_others"?: boolean,"id"?: string,"is_admin"?: boolean,"name": string,"purge_trash"?: boolean,"see_contact_ids"?: boolean,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"default_project_scope"?: string,"deleted_at"?: string | null,"description"?: string | null,"edit_others"?: boolean,"id"?: string,"is_admin"?: boolean,"name"?: string,"purge_trash"?: boolean,"see_contact_ids"?: boolean,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_notes": {
                  Row: {
                    "company_id": string,"content": string,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"id": string,"image_paths": (string)[],"project_id": string,"task_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"image_paths"?: (string)[],"project_id": string,"task_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"image_paths"?: (string)[],"project_id"?: string,"task_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_notes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_notes_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_notes_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "schedule_tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_phases": {
                  Row: {
                    "company_id": string,"cost_phase_key": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"end_date": string | null,"id": string,"name": string,"note": string | null,"position": number,"project_id": string,"start_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"cost_phase_key"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"note"?: string | null,"position"?: number,"project_id": string,"start_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"cost_phase_key"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"position"?: number,"project_id"?: string,"start_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_phases_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_phases_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_tasks": {
                  Row: {
                    "assignee": string | null,"assignee_id": string | null,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"depends_on": (string)[],"end_date": string | null,"id": string,"name": string,"note": string | null,"phase_id": string | null,"position": number,"progress_pct": number,"project_id": string,"start_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee"?: string | null,"assignee_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"depends_on"?: (string)[],"end_date"?: string | null,"id"?: string,"name": string,"note"?: string | null,"phase_id"?: string | null,"position"?: number,"progress_pct"?: number,"project_id": string,"start_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assignee"?: string | null,"assignee_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"depends_on"?: (string)[],"end_date"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"phase_id"?: string | null,"position"?: number,"progress_pct"?: number,"project_id"?: string,"start_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_tasks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_tasks_phase_id_fkey"
      columns: ["phase_id"]
isOneToOne: false
      referencedRelation: "schedule_phases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_templates": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"data": NonNullable<Json>,"deleted_at": string | null,"deleted_by": string | null,"id": string,"is_default": boolean,"kind": string,"name": string,"project_kind": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_default"?: boolean,"kind"?: string,"name": string,"project_kind"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_default"?: boolean,"kind"?: string,"name"?: string,"project_kind"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_templates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"id": string,"is_final": boolean,"kind": string,"note": string | null,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_final"?: boolean,"kind": string,"note"?: string | null,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"is_final"?: boolean,"kind"?: string,"note"?: string | null,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"subcontractors": {
                  Row: {
                    "archived": boolean,"company_id": string,"contact_person": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"field": string | null,"id": string,"name": string,"note": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"company_id"?: string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"field"?: string | null,"id"?: string,"name": string,"note"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"company_id"?: string,"contact_person"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"field"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcontractors_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"subcontracts": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"date": string | null,"deleted_at": string | null,"deleted_by": string | null,"description": string | null,"id": string,"items": NonNullable<Json>,"legacy_variation": number,"project_id": string,"quantity": number | null,"subcontractor_id": string,"unit_price": number | null,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"legacy_variation"?: number,"project_id": string,"quantity"?: number | null,"subcontractor_id": string,"unit_price"?: number | null,"updated_at"?: string,"value"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"legacy_variation"?: number,"project_id"?: string,"quantity"?: number | null,"subcontractor_id"?: string,"unit_price"?: number | null,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcontracts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcontracts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcontracts_subcontractor_id_fkey"
      columns: ["subcontractor_id"]
isOneToOne: false
      referencedRelation: "subcontractors"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "address": string | null,"archived": boolean,"buys_on_credit": boolean,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"name": string,"note": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived"?: boolean,"buys_on_credit"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"name": string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived"?: boolean,"buys_on_credit"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"timesheet_lines": {
                  Row: {
                    "allowance": number,"company_id": string,"created_at": string,"created_by": string | null,"daily_wage": number,"day_units": (number)[],"debt_deduction": number,"deleted_at": string | null,"deleted_by": string | null,"id": string,"legacy_loan": number,"note": string | null,"position": number,"retail_purchase": number,"role": string | null,"updated_at": string,"week_id": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowance"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"daily_wage"?: number,"day_units"?: (number)[],"debt_deduction"?: number,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"legacy_loan"?: number,"note"?: string | null,"position"?: number,"retail_purchase"?: number,"role"?: string | null,"updated_at"?: string,"week_id": string,"worker_id": string
                  }
                  Update: {
                    "allowance"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"daily_wage"?: number,"day_units"?: (number)[],"debt_deduction"?: number,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"legacy_loan"?: number,"note"?: string | null,"position"?: number,"retail_purchase"?: number,"role"?: string | null,"updated_at"?: string,"week_id"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "timesheet_lines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timesheet_lines_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "timesheet_weeks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timesheet_lines_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"timesheet_weeks": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"note": string | null,"project_id": string,"updated_at": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"note"?: string | null,"project_id": string,"updated_at"?: string,"week_start": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"note"?: string | null,"project_id"?: string,"updated_at"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "timesheet_weeks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timesheet_weeks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"wage_advances": {
                  Row: {
                    "amount": number,"company_id": string,"counts_in_net_pay": boolean,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"deleted_by": string | null,"direction": string,"id": string,"note": string | null,"project_id": string | null,"source_week_id": string | null,"updated_at": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id"?: string,"counts_in_net_pay"?: boolean,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"direction": string,"id"?: string,"note"?: string | null,"project_id"?: string | null,"source_week_id"?: string | null,"updated_at"?: string,"worker_id": string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"counts_in_net_pay"?: boolean,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"direction"?: string,"id"?: string,"note"?: string | null,"project_id"?: string | null,"source_week_id"?: string | null,"updated_at"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wage_advances_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wage_advances_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wage_advances_source_week_id_fkey"
      columns: ["source_week_id"]
isOneToOne: false
      referencedRelation: "timesheet_weeks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wage_advances_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"workers": {
                  Row: {
                    "archived": boolean,"company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"full_name": string | null,"id": string,"name": string,"note": string | null,"role": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"full_name"?: string | null,"id"?: string,"name": string,"note"?: string | null,"role"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"full_name"?: string | null,"id"?: string,"name"?: string,"note"?: string | null,"role"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_backup_tables":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"_equipment_note_key":
{ Args: { "n": string }; Returns: string
                           },
"_equipment_put":
{ Args: { "p_condition": string,"p_date": string,"p_location": string,"p_name_id": string,"p_note": string,"p_project_id": string,"p_qty": number,"p_skip"?: string }; Returns: string
                           },
"_snapshot_company":
{ Args: { "p_company": string }; Returns: Json
                           },
"_snapshot_counts":
{ Args: { "snap": Json }; Returns: Json
                           },
"_trash_edit_mods":
{ Args: { "p_table": string }; Returns: (string)[]
                           },
"admin_list_accounts":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"display_name": string,"id": string,"is_locked": boolean,"last_sign_in_at": string,"must_change_password": boolean,"project_ids": (string)[],"project_scope": string,"role_id": string,"role_name": string,"username": string
            }[]
                           },
"admin_wipe_business_data":
{ Args: { "target_company": string }; Returns: undefined
                           },
"can_edit_row":
{ Args: { "modules": (string)[],"row_created_by": string }; Returns: boolean
                           },
"close_payable":
{ Args: { "p_amount": number,"p_by": string,"p_date": string,"p_note": string,"p_project_id": string,"p_subcontractor_id": string }; Returns: string
                           },
"complete_password_change":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"create_backup":
{ Args: { "p_company"?: string,"p_kind"?: string,"p_note"?: string }; Returns: string
                           },
"current_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_settlement":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_timesheet_week":
{ Args: { "p_week_id": string }; Returns: undefined
                           },
"edit_equipment":
{ Args: { "p_condition": string,"p_id": string,"p_note": string,"p_quantity": number }; Returns: string
                           },
"export_company_snapshot":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_backup_data":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_my_access":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_any_permission":
{ Args: { "level": string,"modules": (string)[] }; Returns: boolean
                           },
"has_permission":
{ Args: { "level": string,"module": string }; Returns: boolean
                           },
"has_special":
{ Args: { "flag": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"level_rank":
{ Args: { "lvl": string }; Returns: number
                           },
"list_contact_private_masked":
{ Args: Record<PropertyKey, never>; Returns: {
              "customer_id": string,"employee_id": string,"has_bank_account": boolean,"id_number": string,"phone": string,"subcontractor_id": string,"worker_id": string
            }[]
                           },
"mask_middle":
{ Args: { "head": number,"tail": number,"v": string }; Returns: string
                           },
"my_project_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"replace_payment_allocations":
{ Args: { "p_allocs": Json,"p_payment_ids": (string)[] }; Returns: number
                           },
"restore_backup":
{ Args: { "p_data": Json }; Returns: Json
                           },
"save_equipment":
{ Args: { "p_date": string,"p_location": string,"p_project_id": string,"p_rows": Json }; Returns: number
                           },
"save_settlement":
{ Args: { "p_amount": number,"p_date": string,"p_id": string,"p_is_final": boolean,"p_kind": string,"p_note": string,"p_project_id": string,"p_receipt_amount": number,"p_receipt_mode": string }; Returns: string
                           },
"save_timesheet_week":
{ Args: { "p_lines": Json,"p_project_id": string,"p_week_start": string }; Returns: string
                           },
"sees_all_projects":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"transfer_equipment":
{ Args: { "p_condition": string,"p_date": string,"p_id": string,"p_location": string,"p_note": string,"p_project_id": string,"p_qty": number }; Returns: string
                           },
"trash_purge":
{ Args: { "p_id": string,"p_table": string }; Returns: undefined
                           },
"trash_restore":
{ Args: { "p_id": string,"p_table": string }; Returns: undefined
                           },
"undo_payable_closure":
{ Args: { "p_closure_id": string }; Returns: undefined
                           },
"update_my_display_name":
{ Args: { "new_name": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
