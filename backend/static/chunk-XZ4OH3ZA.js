import{c as ae}from"./chunk-VHUD3C4V.js";import{a as ce}from"./chunk-L2AODKLO.js";import{b as te,i as x,j as oe,m as ie}from"./chunk-QYEQI4EQ.js";import{V as Z,W as J,na as W,oa as I,ua as Y}from"./chunk-2KYWLR7J.js";import{a as ee,d as ne}from"./chunk-2325T7AW.js";import{$c as U,Ac as V,Db as O,Fb as h,Gc as k,Hc as q,Ib as $,Jb as L,Ka as d,Kb as _,L as E,Lb as y,M as S,N as F,P as N,R as m,Rb as Q,Sb as l,Tc as G,Vc as K,Xc as X,Y as p,Ya as g,Za as D,ab as A,bb as v,ca as f,cb as b,gc as j,ha as z,ib as s,kc as H,la as u,rb as a,sb as B,tb as M,ub as C,wc as R,xb as P,yb as w,zb as T}from"./chunk-PG6J5NCR.js";var ue=["data-p-icon","minus"],re=(()=>{class e extends ie{static \u0275fac=(()=>{let n;return function(t){return(n||(n=u(e)))(t||e)}})();static \u0275cmp=g({type:e,selectors:[["","data-p-icon","minus"]],features:[v],attrs:ue,decls:1,vars:0,consts:[["d","M13.2222 7.77778H0.777778C0.571498 7.77778 0.373667 7.69584 0.227806 7.54998C0.0819442 7.40412 0 7.20629 0 7.00001C0 6.79373 0.0819442 6.5959 0.227806 6.45003C0.373667 6.30417 0.571498 6.22223 0.777778 6.22223H13.2222C13.4285 6.22223 13.6263 6.30417 13.7722 6.45003C13.9181 6.5959 14 6.79373 14 7.00001C14 7.20629 13.9181 7.40412 13.7722 7.54998C13.6263 7.69584 13.4285 7.77778 13.2222 7.77778Z","fill","currentColor"]],template:function(o,t){o&1&&(p(),P(0,"path",0))},encapsulation:2})}return e})();var de=`
    .p-checkbox {
        position: relative;
        display: inline-flex;
        user-select: none;
        vertical-align: bottom;
        width: dt('checkbox.width');
        height: dt('checkbox.height');
    }

    .p-checkbox-input {
        cursor: pointer;
        appearance: none;
        position: absolute;
        inset-block-start: 0;
        inset-inline-start: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        margin: 0;
        opacity: 0;
        z-index: 1;
        outline: 0 none;
        border: 1px solid transparent;
        border-radius: dt('checkbox.border.radius');
    }

    .p-checkbox-box {
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: dt('checkbox.border.radius');
        border: 1px solid dt('checkbox.border.color');
        background: dt('checkbox.background');
        width: dt('checkbox.width');
        height: dt('checkbox.height');
        transition:
            background dt('checkbox.transition.duration'),
            color dt('checkbox.transition.duration'),
            border-color dt('checkbox.transition.duration'),
            box-shadow dt('checkbox.transition.duration'),
            outline-color dt('checkbox.transition.duration');
        outline-color: transparent;
        box-shadow: dt('checkbox.shadow');
    }

    .p-checkbox-icon {
        transition-duration: dt('checkbox.transition.duration');
        color: dt('checkbox.icon.color');
        font-size: dt('checkbox.icon.size');
        width: dt('checkbox.icon.size');
        height: dt('checkbox.icon.size');
    }

    .p-checkbox:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        border-color: dt('checkbox.hover.border.color');
    }

    .p-checkbox-checked .p-checkbox-box {
        border-color: dt('checkbox.checked.border.color');
        background: dt('checkbox.checked.background');
    }

    .p-checkbox-checked .p-checkbox-icon {
        color: dt('checkbox.icon.checked.color');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        background: dt('checkbox.checked.hover.background');
        border-color: dt('checkbox.checked.hover.border.color');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-icon {
        color: dt('checkbox.icon.checked.hover.color');
    }

    .p-checkbox:not(.p-disabled):has(.p-checkbox-input:focus-visible) .p-checkbox-box {
        border-color: dt('checkbox.focus.border.color');
        box-shadow: dt('checkbox.focus.ring.shadow');
        outline: dt('checkbox.focus.ring.width') dt('checkbox.focus.ring.style') dt('checkbox.focus.ring.color');
        outline-offset: dt('checkbox.focus.ring.offset');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:focus-visible) .p-checkbox-box {
        border-color: dt('checkbox.checked.focus.border.color');
    }

    .p-checkbox.p-invalid > .p-checkbox-box {
        border-color: dt('checkbox.invalid.border.color');
    }

    .p-checkbox.p-variant-filled .p-checkbox-box {
        background: dt('checkbox.filled.background');
    }

    .p-checkbox-checked.p-variant-filled .p-checkbox-box {
        background: dt('checkbox.checked.background');
    }

    .p-checkbox-checked.p-variant-filled:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        background: dt('checkbox.checked.hover.background');
    }

    .p-checkbox.p-disabled {
        opacity: 1;
    }

    .p-checkbox.p-disabled .p-checkbox-box {
        background: dt('checkbox.disabled.background');
        border-color: dt('checkbox.checked.disabled.border.color');
    }

    .p-checkbox.p-disabled .p-checkbox-box .p-checkbox-icon {
        color: dt('checkbox.icon.disabled.color');
    }

    .p-checkbox-sm,
    .p-checkbox-sm .p-checkbox-box {
        width: dt('checkbox.sm.width');
        height: dt('checkbox.sm.height');
    }

    .p-checkbox-sm .p-checkbox-icon {
        font-size: dt('checkbox.icon.sm.size');
        width: dt('checkbox.icon.sm.size');
        height: dt('checkbox.icon.sm.size');
    }

    .p-checkbox-lg,
    .p-checkbox-lg .p-checkbox-box {
        width: dt('checkbox.lg.width');
        height: dt('checkbox.lg.height');
    }

    .p-checkbox-lg .p-checkbox-icon {
        font-size: dt('checkbox.icon.lg.size');
        width: dt('checkbox.icon.lg.size');
        height: dt('checkbox.icon.lg.size');
    }
`;var be=["icon"],ke=["input"],xe=(e,r,n)=>({checked:e,class:r,dataP:n});function me(e,r){if(e&1&&C(0,"span",8),e&2){let n=h(3);l(n.cx("icon")),a("ngClass",n.checkboxIcon)("pBind",n.ptm("icon")),s("data-p",n.dataP)}}function fe(e,r){if(e&1&&(p(),C(0,"svg",9)),e&2){let n=h(3);l(n.cx("icon")),a("pBind",n.ptm("icon")),s("data-p",n.dataP)}}function ge(e,r){if(e&1&&(w(0),b(1,me,1,5,"span",6)(2,fe,1,4,"svg",7),T()),e&2){let n=h(2);d(),a("ngIf",n.checkboxIcon),d(),a("ngIf",!n.checkboxIcon)}}function ve(e,r){if(e&1&&(p(),C(0,"svg",10)),e&2){let n=h(2);l(n.cx("icon")),a("pBind",n.ptm("icon")),s("data-p",n.dataP)}}function Ce(e,r){if(e&1&&(w(0),b(1,ge,3,2,"ng-container",3)(2,ve,1,4,"svg",5),T()),e&2){let n=h();d(),a("ngIf",n.checked),d(),a("ngIf",n._indeterminate())}}function _e(e,r){}function ye(e,r){e&1&&b(0,_e,0,0,"ng-template")}var Ie=`
    ${de}

    /* For PrimeNG */
    p-checkBox.ng-invalid.ng-dirty .p-checkbox-box,
    p-check-box.ng-invalid.ng-dirty .p-checkbox-box,
    p-checkbox.ng-invalid.ng-dirty .p-checkbox-box {
        border-color: dt('checkbox.invalid.border.color');
    }
`,Be={root:({instance:e})=>["p-checkbox p-component",{"p-checkbox-checked p-highlight":e.checked,"p-disabled":e.$disabled(),"p-invalid":e.invalid(),"p-variant-filled":e.$variant()==="filled","p-checkbox-sm p-inputfield-sm":e.size()==="small","p-checkbox-lg p-inputfield-lg":e.size()==="large"}],box:"p-checkbox-box",input:"p-checkbox-input",icon:"p-checkbox-icon"},se=(()=>{class e extends Y{name="checkbox";style=Ie;classes=Be;static \u0275fac=(()=>{let n;return function(t){return(n||(n=u(e)))(t||e)}})();static \u0275prov=S({token:e,factory:e.\u0275fac})}return e})();var le=new N("CHECKBOX_INSTANCE"),Me={provide:ee,useExisting:E(()=>he),multi:!0},he=(()=>{class e extends ae{componentName="Checkbox";hostName="";value;binary;ariaLabelledBy;ariaLabel;tabindex;inputId;inputStyle;styleClass;inputClass;indeterminate=!1;formControl;checkboxIcon;readonly;autofocus;trueValue=!0;falseValue=!1;variant=V();size=V();onChange=new f;onFocus=new f;onBlur=new f;inputViewChild;get checked(){return this._indeterminate()?!1:this.binary?this.modelValue()===this.trueValue:J(this.value,this.modelValue())}_indeterminate=z(void 0);checkboxIconTemplate;templates;_checkboxIconTemplate;focused=!1;_componentStyle=m(se);bindDirectiveInstance=m(x,{self:!0});$pcCheckbox=m(le,{optional:!0,skipSelf:!0})??void 0;$variant=R(()=>this.variant()||this.config.inputStyle()||this.config.inputVariant());onAfterContentInit(){this.templates?.forEach(n=>{switch(n.getType()){case"icon":this._checkboxIconTemplate=n.template;break;case"checkboxicon":this._checkboxIconTemplate=n.template;break}})}onChanges(n){n.indeterminate&&this._indeterminate.set(n.indeterminate.currentValue)}onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptms(["host","root"]))}updateModel(n){let o,t=this.injector.get(ne,null,{optional:!0,self:!0}),i=t&&!this.formControl?t.value:this.modelValue();this.binary?(o=this._indeterminate()?this.trueValue:this.checked?this.falseValue:this.trueValue,this.writeModelValue(o),this.onModelChange(o)):(this.checked||this._indeterminate()?o=i.filter(c=>!Z(c,this.value)):o=i?[...i,this.value]:[this.value],this.onModelChange(o),this.writeModelValue(o),this.formControl&&this.formControl.setValue(o)),this._indeterminate()&&this._indeterminate.set(!1),this.onChange.emit({checked:o,originalEvent:n})}handleChange(n){this.readonly||this.updateModel(n)}onInputFocus(n){this.focused=!0,this.onFocus.emit(n)}onInputBlur(n){this.focused=!1,this.onBlur.emit(n),this.onModelTouched()}focus(){this.inputViewChild?.nativeElement.focus()}writeControlValue(n,o){o(n),this.cd.markForCheck()}get dataP(){return this.cn({invalid:this.invalid(),checked:this.checked,disabled:this.$disabled(),filled:this.$variant()==="filled",[this.size()]:this.size()})}static \u0275fac=(()=>{let n;return function(t){return(n||(n=u(e)))(t||e)}})();static \u0275cmp=g({type:e,selectors:[["p-checkbox"],["p-checkBox"],["p-check-box"]],contentQueries:function(o,t,i){if(o&1&&$(i,be,4)(i,W,4),o&2){let c;_(c=y())&&(t.checkboxIconTemplate=c.first),_(c=y())&&(t.templates=c)}},viewQuery:function(o,t){if(o&1&&L(ke,5),o&2){let i;_(i=y())&&(t.inputViewChild=i.first)}},hostVars:6,hostBindings:function(o,t){o&2&&(s("data-p-highlight",t.checked)("data-p-checked",t.checked)("data-p-disabled",t.$disabled())("data-p",t.dataP),l(t.cn(t.cx("root"),t.styleClass)))},inputs:{hostName:"hostName",value:"value",binary:[2,"binary","binary",k],ariaLabelledBy:"ariaLabelledBy",ariaLabel:"ariaLabel",tabindex:[2,"tabindex","tabindex",q],inputId:"inputId",inputStyle:"inputStyle",styleClass:"styleClass",inputClass:"inputClass",indeterminate:[2,"indeterminate","indeterminate",k],formControl:"formControl",checkboxIcon:"checkboxIcon",readonly:[2,"readonly","readonly",k],autofocus:[2,"autofocus","autofocus",k],trueValue:"trueValue",falseValue:"falseValue",variant:[1,"variant"],size:[1,"size"]},outputs:{onChange:"onChange",onFocus:"onFocus",onBlur:"onBlur"},features:[j([Me,se,{provide:le,useExisting:e},{provide:te,useExisting:e}]),A([x]),v],decls:5,vars:26,consts:[["input",""],["type","checkbox",3,"focus","blur","change","checked","pBind"],[3,"pBind"],[4,"ngIf"],[4,"ngTemplateOutlet","ngTemplateOutletContext"],["data-p-icon","minus",3,"class","pBind",4,"ngIf"],[3,"class","ngClass","pBind",4,"ngIf"],["data-p-icon","check",3,"class","pBind",4,"ngIf"],[3,"ngClass","pBind"],["data-p-icon","check",3,"pBind"],["data-p-icon","minus",3,"pBind"]],template:function(o,t){o&1&&(B(0,"input",1,0),O("focus",function(c){return t.onInputFocus(c)})("blur",function(c){return t.onInputBlur(c)})("change",function(c){return t.handleChange(c)}),M(),B(2,"div",2),b(3,Ce,3,2,"ng-container",3)(4,ye,1,0,null,4),M()),o&2&&(Q(t.inputStyle),l(t.cn(t.cx("input"),t.inputClass)),a("checked",t.checked)("pBind",t.ptm("input")),s("id",t.inputId)("value",t.value)("name",t.name())("tabindex",t.tabindex)("required",t.required()?"":void 0)("readonly",t.readonly?"":void 0)("disabled",t.$disabled()?"":void 0)("aria-labelledby",t.ariaLabelledBy)("aria-label",t.ariaLabel),d(2),l(t.cx("box")),a("pBind",t.ptm("box")),s("data-p",t.dataP),d(),a("ngIf",!t.checkboxIconTemplate&&!t._checkboxIconTemplate),d(),a("ngTemplateOutlet",t.checkboxIconTemplate||t._checkboxIconTemplate)("ngTemplateOutletContext",H(22,xe,t.checked,t.cx("icon"),t.dataP)))},dependencies:[U,G,K,X,I,ce,re,oe,x],encapsulation:2,changeDetection:0})}return e})(),en=(()=>{class e{static \u0275fac=function(o){return new(o||e)};static \u0275mod=D({type:e});static \u0275inj=F({imports:[he,I,I]})}return e})();export{he as a,en as b};
